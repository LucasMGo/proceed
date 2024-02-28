'use client';

import React, { useEffect, useState } from 'react';

import { Modal, Checkbox, Radio, RadioChangeEvent, Space, Flex, Divider, Tooltip } from 'antd';
import type { CheckboxValueType } from 'antd/es/checkbox/Group';

import { exportProcesses } from '@/lib/process-export';
import { ProcessExportOptions, ExportProcessInfo } from '@/lib/process-export/export-preparation';

import {
  settings as pdfSettings,
  settingsOptions as pdfOptions,
} from '@/app/shared-viewer/settings-modal';
import { generateProcessShareToken } from '@/lib/sharing/process-sharing';

const exportTypeOptions = [
  { label: 'BPMN', value: 'bpmn' },
  { label: 'PDF', value: 'pdf' },
  { label: 'SVG', value: 'svg' },
  { label: 'PNG', value: 'png' },
];

export type ProcessExportTypes = ProcessExportOptions['type'] | 'pdf';

function getSubOptions(giveSelectionOption?: boolean) {
  const exportSubOptions = {
    bpmn: [
      {
        label: 'with artefacts',
        value: 'artefacts',
        tooltip:
          'Also export html and images used in User-Tasks and images used for other process elements',
      },
      {
        label: 'with referenced processes',
        value: 'imports',
        tooltip: 'Also export all referenced processes used in call-activities',
      },
    ],
    pdf: pdfSettings,
    svg: [
      {
        label: 'with referenced processes',
        value: 'imports',
        tooltip: 'Also export all referenced processes used in call-activities',
      },
      {
        label: 'with collapsed subprocesses',
        value: 'subprocesses',
        tooltip: 'Also export content of all collapsed subprocesses',
      },
    ],
    png: [
      {
        label: 'with referenced processes',
        value: 'imports',
        tooltip: 'Also export all referenced processes used in call-activities',
      },
      {
        label: 'with collapsed subprocesses',
        value: 'subprocesses',
        tooltip: 'Also export content of all collapsed subprocesses',
      },
    ],
  };

  const selectionOption = {
    label: 'limit to selection',
    value: 'onlySelection',
    tooltip:
      'Exclude elements from the image(s) that are not selected and not inside a selected element',
  };

  if (giveSelectionOption) {
    exportSubOptions.png.push(selectionOption);
    exportSubOptions.svg.push(selectionOption);
  }

  return exportSubOptions;
}

type ProcessExportModalProps = {
  processes: ExportProcessInfo; // the processes to export
  onClose: () => void;
  open: boolean;
  giveSelectionOption?: boolean;
  preselectedExportType?: ProcessExportTypes;
  resetPreselectedExportType?: () => void; // if the user can select to limit the export to elements selected in the modeler (only usable in the modeler)
};

const ProcessExportModal: React.FC<ProcessExportModalProps> = ({
  processes = [],
  onClose,
  open,
  giveSelectionOption,
  preselectedExportType,
  resetPreselectedExportType,
}) => {
  const [selectedType, setSelectedType] = useState<ProcessExportTypes | undefined>(
    preselectedExportType,
  );

  useEffect(() => {
    setSelectedType(preselectedExportType);
  }, [preselectedExportType]);

  const [selectedOptions, setSelectedOptions] = useState<CheckboxValueType[]>(
    ['metaData'].concat(pdfOptions),
  );
  const [isExporting, setIsExporting] = useState(false);
  const [pngScalingFactor, setPngScalingFactor] = useState(1.5);

  const handleTypeSelectionChange = ({ target: { value } }: RadioChangeEvent) => {
    setSelectedType(value);
  };

  const handleOptionSelectionChange = (checkedValues: CheckboxValueType[]) => {
    setSelectedOptions(checkedValues);
  };

  const handleClose = () => {
    setIsExporting(false);
    setSelectedOptions(selectedOptions.filter((el) => el !== 'onlySelection'));
    if (preselectedExportType && resetPreselectedExportType) resetPreselectedExportType();
    setSelectedType(undefined);
    onClose();
  };

  const handleOk = async () => {
    setIsExporting(true);

    if (selectedType === 'pdf') {
      const { definitionId, processVersion } = processes[0];

      const { token } = await generateProcessShareToken({
        processId: definitionId,
        version: processVersion,
        settings: selectedOptions as any,
      });
      // open the documentation page in a new tab
      window.open(
        `${window.location.origin}/shared-viewer?token=${token}`,
        `${definitionId}-${processVersion}-tab`,
      );
    } else {
      await exportProcesses(
        {
          type: selectedType!,
          artefacts: selectedOptions.includes('artefacts'),
          subprocesses: selectedOptions.includes('subprocesses'),
          imports: selectedOptions.includes('imports'),
          scaling: pngScalingFactor,
          exportSelectionOnly: selectedOptions.includes('onlySelection'),
          useWebshareApi: preselectedExportType !== undefined,
        },
        processes,
      );
    }

    handleClose();
  };

  const typeSelection = (
    <Radio.Group onChange={handleTypeSelectionChange} value={selectedType} style={{ width: '50%' }}>
      <Space direction="vertical">
        {exportTypeOptions.map(({ label, value }) => (
          <Radio value={value} key={value}>
            {label}
          </Radio>
        ))}
      </Space>
    </Radio.Group>
  );

  const disabledPdfExport = selectedType === 'pdf' && processes.length > 1;

  const optionSelection = (
    <Space direction="vertical">
      <Checkbox.Group
        onChange={handleOptionSelectionChange}
        value={selectedOptions}
        style={{ width: '100%' }}
      >
        <Space direction="vertical">
          {(selectedType ? getSubOptions(giveSelectionOption)[selectedType] : []).map(
            ({ label, value, tooltip }) => (
              <Checkbox value={value} key={label} disabled={disabledPdfExport}>
                <Tooltip placement="right" title={tooltip}>
                  {label}
                </Tooltip>
              </Checkbox>
            ),
          )}
        </Space>
      </Checkbox.Group>
      {selectedType === 'png' && (
        <div style={{ marginTop: '10px' }}>
          <Tooltip placement="left" title="Export with different image resolutions">
            <span>Quality:</span>
          </Tooltip>

          <Radio.Group
            onChange={(e) => setPngScalingFactor(e.target.value)}
            value={pngScalingFactor}
          >
            <Radio value={1.5}>
              <Tooltip placement="bottom" title="Smallest resolution and smallest file size">
                Normal
              </Tooltip>
            </Radio>
            <Radio value={2.5}>
              <Tooltip placement="bottom" title="Medium resolution and medium file size">
                Good
              </Tooltip>
            </Radio>
            <Radio value={4}>
              <Tooltip placement="bottom" title="Highest resolution and biggest file size">
                Excellent
              </Tooltip>
            </Radio>
          </Radio.Group>
        </div>
      )}
    </Space>
  );

  return (
    <>
      <Modal
        title={
          preselectedExportType
            ? `Share selected Processes as ${preselectedExportType.toUpperCase()}`
            : `Export selected Processes`
        }
        open={open}
        style={{ position: 'relative', zIndex: '1 !important' }}
        onOk={handleOk}
        onCancel={handleClose}
        centered
        zIndex={200}
        okButtonProps={{
          disabled: !selectedType || disabledPdfExport,
          loading: isExporting,
          title: disabledPdfExport
            ? 'PDF export is only available when a single process is selected'
            : undefined,
        }}
        width={540}
      >
        <Flex>
          {preselectedExportType ? null : typeSelection}
          <Divider type="vertical" style={{ height: 'auto' }} />
          {!!selectedType && optionSelection}
        </Flex>
      </Modal>
    </>
  );
};

export default ProcessExportModal;
