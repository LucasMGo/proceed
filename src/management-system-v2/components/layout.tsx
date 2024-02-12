'use client';

import styles from './layout.module.scss';
import { FC, PropsWithChildren, useState } from 'react';
import { Layout as AntLayout, Grid, Menu } from 'antd';
const { Item, Divider, ItemGroup } = Menu;
import { SettingOutlined, ApiOutlined, UserOutlined, UnlockOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import cn from 'classnames';
import { useAbilityStore } from '@/lib/abilityStore';
import Link from 'next/link';
import SiderMenu from './menu-sider';
import { useSession } from 'next-auth/react';

type LayoutProps = PropsWithChildren<{
  hideSider?: boolean;
}>;

/**
 * The main layout of the application. It defines the sidebar and footer. Note
 * that the header is not part of this and instead defined in the Content.tsx
 * component. This is because the header should be customizable by the page,
 * while this component stays the same for all pages.
 *
 * This component is meant to be used in layout.tsx files so it stays out of the
 * page content in parallel routes.
 */
const Layout: FC<LayoutProps> = ({ children, hideSider }) => {
  const activeSegment = usePathname().slice(1) || 'processes';
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const { status } = useSession();
  const loggedIn = status === 'authenticated';
  const ability = useAbilityStore((state) => state.ability);
  const breakpoint = Grid.useBreakpoint();

  return (
    <AntLayout style={{ height: '100vh' }}>
      <AntLayout hasSider>
        {!hideSider && (
          <AntLayout.Sider
            style={{
              backgroundColor: '#fff',
              borderRight: '1px solid #eee',
            }}
            className={cn(styles.Sider)}
            collapsible
            collapsed={collapsed}
            onCollapse={(collapsed) => setCollapsed(collapsed)}
            collapsedWidth={breakpoint.xs ? '0' : '80'}
            breakpoint="md"
            trigger={null}
          >
            <div className={styles.LogoContainer}>
              <Link href="/processes">
                <Image
                  src={breakpoint.xs ? '/proceed-icon.png' : '/proceed.svg'}
                  alt="PROCEED Logo"
                  className={cn(breakpoint.xs ? styles.Icon : styles.Logo, {
                    [styles.collapsed]: collapsed,
                  })}
                  width={breakpoint.xs ? 85 : 160}
                  height={breakpoint.xs ? 35 : 63}
                  priority
                />
              </Link>
            </div>
            {loggedIn ? <SiderMenu /> : null}
          </AntLayout.Sider>
        )}
        <div className={cn(styles.Main, { [styles.collapsed]: collapsed })}>{children}</div>
      </AntLayout>
      <AntLayout.Footer className={cn(styles.Footer)}>© 2024 PROCEED Labs GmbH</AntLayout.Footer>
    </AntLayout>
  );
};

export default Layout;
