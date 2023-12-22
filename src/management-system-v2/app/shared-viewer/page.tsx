'use client';
import { useEffect, useState } from 'react';
import EmbeddedModeler from '@/components/embedded-modeler';
import { useRouter, usePathname } from 'next/navigation';

import { useSession } from 'next-auth/react';

interface PageProps {
  searchParams: {
    [key: string]: string[] | string | undefined;
  };
}

const SharedViewer = ({ searchParams }: PageProps) => {
  const router = useRouter();
  const pathname = usePathname();

  const session = useSession();
  const [process, setProcess] = useState(null);
  useEffect(() => {
    const validateToken = async () => {
      try {
        if (searchParams.token) {
          const response = await fetch('/api/share/validate-share-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              token: searchParams.token,
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to validate token - ${response.status} ${response.statusText}`);
          }

          const { process, registeredUsersOnly } = await response.json();
          if (registeredUsersOnly && session.status === 'unauthenticated') {
            const callbackUrl = `${window.location.origin}${pathname}?token=${searchParams.token}`;
            const loginPath = `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;

            router.replace(loginPath);
          }
          setProcess(process);
        }
      } catch (error) {
        throw new Error('Internal Server Error');
      }
    };

    validateToken();
  }, [pathname, router, searchParams.token, session.status]);

  return (
    <div>
      {process ? (
        <EmbeddedModeler processData={process} />
      ) : (
        <p style={{ color: 'red' }}>Loading...</p>
      )}
    </div>
  );
};

export default SharedViewer;
