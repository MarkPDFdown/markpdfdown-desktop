import React from 'react';
import { Tabs } from 'antd';
import type { TabsProps } from 'antd';
import ModelConfig from '../components/ModelConfig';
const Settings: React.FC = () => {
  const items: TabsProps['items'] = [
    {
      key: '1',
      label: '模型服务',
      children: <ModelConfig />,
    },
    {
      key: '2',
      label: '关于我们',
      children: <div>Content of Tab 2</div>,
    },
  ];
  return (
    <div>
      <Tabs defaultActiveKey="1" items={items} />
    </div>
  );
};

export default Settings; 