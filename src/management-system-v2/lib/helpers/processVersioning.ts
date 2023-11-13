import {
  toBpmnObject,
  toBpmnXml,
  getDefinitionsId,
  setDefinitionsVersionInformation,
  getDefinitionsVersionInformation,
  getUserTaskImplementationString,
  getUserTaskFileNameMapping,
  setUserTaskData,
} from '@proceed/bpmn-helper';

import { ApiData, get, put, post } from '../fetch-data';

import { asyncForEach, asyncMap } from './javascriptHelpers';

const { diff } = require('bpmn-js-differ');

export async function areVersionsEqual(bpmn: string, otherBpmn: string) {
  const bpmnObj = await toBpmnObject(bpmn);
  const otherBpmnObj = await toBpmnObject(otherBpmn);

  const {
    version,
    name: versionName,
    description: versionDescription,
    versionBasedOn,
  } = await getDefinitionsVersionInformation(otherBpmnObj);

  if (version) {
    // check if the two bpmns were the same if they had the same version information
    await setDefinitionsVersionInformation(bpmnObj, {
      version,
      versionName,
      versionDescription,
      versionBasedOn,
    });

    // compare the two bpmns
    const changes = diff(otherBpmnObj, bpmnObj);
    const hasChanges =
      Object.keys(changes._changed).length ||
      Object.keys(changes._removed).length ||
      Object.keys(changes._added).length ||
      Object.keys(changes._layoutChanged).length;

    return !hasChanges;
  }

  return false;
}

export async function convertToEditableBpmn(bpmn: string) {
  let bpmnObj = await toBpmnObject(bpmn);

  const { version } = await getDefinitionsVersionInformation(bpmnObj);

  bpmnObj = (await setDefinitionsVersionInformation(bpmnObj, {
    versionBasedOn: version,
  })) as object;

  const changedFileNames = {} as { [key: string]: string };

  const fileNameMapping = await getUserTaskFileNameMapping(bpmnObj);

  await asyncForEach(Object.entries(fileNameMapping), async ([userTaskId, { fileName }]) => {
    if (fileName) {
      const [unversionedName] = fileName.split('-');
      changedFileNames[fileName] = unversionedName;
      await setUserTaskData(bpmnObj, userTaskId, unversionedName);
    }
  });

  return { bpmn: await toBpmnXml(bpmnObj), changedFileNames };
}

async function getLocalVersionBpmn(
  process: ApiData<'/process', 'get'>[number],
  localVersion: number,
) {
  // early exit if there are no known versions for the process locally
  if (!Array.isArray(process.versions) || !process.versions.length) return;

  // check if the specific version exists locally and get its bpmn if it does
  if (process.versions.some(({ version }) => +version == localVersion)) {
    const { data: bpmn } = await get('/process/{definitionId}/versions/{version}', {
      params: { path: { definitionId: process.definitionId, version: localVersion.toString() } },
      parseAs: 'text',
    });
    return bpmn;
  }
}

async function versionUserTasks(
  processInfo: ApiData<'/process', 'get'>[number],
  newVersion: number,
  bpmnObj: object,
  dryRun = false,
) {
  const htmlMapping = await getUserTaskFileNameMapping(bpmnObj);

  const { versionBasedOn } = await getDefinitionsVersionInformation(bpmnObj);

  for (let userTaskId in htmlMapping) {
    const { fileName, implementation } = htmlMapping[userTaskId];
    // only version user tasks that use html
    if (fileName && implementation === getUserTaskImplementationString()) {
      const { data } = await get('/process/{definitionId}/user-tasks/{userTaskFileName}', {
        params: {
          path: {
            definitionId: processInfo.definitionId,
            userTaskFileName: fileName,
          },
        },
        parseAs: 'text',
      });
      const userTaskHTML = data!;

      let versionFileName = `${fileName}-${newVersion}`;

      // get the html of the user task in the based on version (if there is one and it is locally known)
      const basedOnBPMN =
        versionBasedOn !== undefined
          ? await getLocalVersionBpmn(processInfo, versionBasedOn)
          : undefined;

      // check if there is a preceding version and if the html of the user task actually changed from that version
      let userTaskHtmlAlreadyExisting = false;
      if (basedOnBPMN) {
        const basedOnVersionHtmlMapping = await getUserTaskFileNameMapping(basedOnBPMN);

        // check if the user task existed and if it had the same html
        const basedOnVersionFileInfo = basedOnVersionHtmlMapping[userTaskId];

        if (basedOnVersionFileInfo && basedOnVersionFileInfo.fileName) {
          const { data: basedOnVersionUserTaskHTML } = await get(
            '/process/{definitionId}/user-tasks/{userTaskFileName}',
            {
              params: {
                path: {
                  definitionId: processInfo.definitionId,
                  userTaskFileName: basedOnVersionFileInfo.fileName,
                },
              },
              parseAs: 'text',
            },
          );

          if (basedOnVersionUserTaskHTML === userTaskHTML) {
            // reuse the html of the previous version
            userTaskHtmlAlreadyExisting = true;
            versionFileName = basedOnVersionFileInfo.fileName;
          }
        }
      }

      // make sure the user task is using the correct data
      await setUserTaskData(
        bpmnObj,
        userTaskId,
        versionFileName,
        getUserTaskImplementationString(),
      );

      // store the user task version if it didn't exist before
      if (!dryRun && !userTaskHtmlAlreadyExisting) {
        await put('/process/{definitionId}/user-tasks/{userTaskFileName}', {
          params: {
            path: { definitionId: processInfo.definitionId, userTaskFileName: versionFileName },
          },
          body: userTaskHTML,
          headers: new Headers({
            'Content-Type': 'text/plain',
          }),
          parseAs: 'text',
        });
      }
    }
  }
}

export async function createNewProcessVersion(
  bpmn: string,
  versionName: string,
  versionDescription: string,
) {
  const bpmnObj = await toBpmnObject(bpmn);
  const definitionId = await getDefinitionsId(bpmnObj);

  if (!definitionId) {
    throw new Error("There is no definitionId for the process. Can't create a new version");
  }

  const processInfo = (
    await get('/process/{definitionId}', {
      params: { path: { definitionId: definitionId } },
    })
  ).data;

  if (!processInfo) {
    throw new Error("Can't create a new version for an unknown process");
  }

  const { versionBasedOn } = await getDefinitionsVersionInformation(bpmnObj);

  // add process version to bpmn
  const epochTime = +new Date();
  await setDefinitionsVersionInformation(bpmnObj, {
    version: epochTime,
    versionName,
    versionDescription,
    versionBasedOn,
  });

  await versionUserTasks(processInfo, epochTime, bpmnObj);

  const versionedBpmn = await toBpmnXml(bpmnObj);

  // if the new version has no changes to the version it is based on don't create a new version and return the previous version
  const basedOnBPMN =
    versionBasedOn !== undefined
      ? await getLocalVersionBpmn(processInfo, versionBasedOn)
      : undefined;

  if (basedOnBPMN && (await areVersionsEqual(versionedBpmn, basedOnBPMN))) {
    return versionBasedOn;
  }

  // send final process version bpmn to the backend
  const response = await post('/process/{definitionId}/versions', {
    body: { bpmn: versionedBpmn },
    params: { path: { definitionId } },
    parseAs: 'text',
  });

  // update versionBasedOn property on original process
  await updateProcessVersionBasedOn(definitionId, epochTime);

  return epochTime;
}

async function updateProcessVersionBasedOn(processDefinitionsId: string, versionBasedOn: number) {
  const { data: processInfo } = await get('/process/{definitionId}', {
    params: { path: { definitionId: processDefinitionsId } },
  });

  if (processInfo?.bpmn) {
    const { version, description, name } = await getDefinitionsVersionInformation(processInfo.bpmn);

    const bpmn = (await setDefinitionsVersionInformation(processInfo.bpmn, {
      version,
      versionDescription: description,
      versionName: name,
      versionBasedOn,
    })) as string;
    await put('/process/{definitionId}', {
      params: { path: { definitionId: processDefinitionsId } },
      body: { bpmn },
    });
  }
}