import React from 'react';
import { Tabs } from 'antd';
import Model from './Model';
const ModelConfig: React.FC = () => {
  const items = [
    {
      key: '1',
      label: 'MarkPDFdown',
      children: 'Content of Tab 1',
    },
    {
      key: '2',
      label: 'OpenRouter',
      children: 'Content of Tab 2',
    },
    {
      key: '3',
      label: '腾讯云TI',
      children: 'Content of Tab 3',
    },
    {
      key: '4',
      label: '添加服务商',
      children: <Model />,
    },
    
    
  ];

  return (
    <div>
      <Tabs
        style={{ height: 'calc(100vh - 180px)' }}
        defaultActiveKey="0"
        tabPosition="left"
        items={items}
      />
    </div>
  );
};

export default ModelConfig; 