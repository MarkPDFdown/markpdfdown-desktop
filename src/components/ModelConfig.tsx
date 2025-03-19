import React from 'react';
import { Tabs, Button } from 'antd';

const ModelConfig: React.FC = () => {

  return (
    <div>
      <Tabs
        defaultActiveKey="0"
        tabPosition="left"
        items={Array.from({ length: 5 }, (_, i) => {
          const id = String(i);
          return {
            label: id === '4' ? '添加服务商' :`Tab-${id}`,
            key: id,
            children: `Content of tab ${id}`,
          };
        })}
      />
    </div>
  );
};

export default ModelConfig; 