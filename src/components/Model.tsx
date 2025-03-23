import React from 'react';
import { Input, Typography, Flex } from 'antd';

const Model: React.FC = () => {
    return <Flex vertical gap={16} style={{ padding: '16px' }}>
        <div>
            <Typography.Text>服务商名称：</Typography.Text>
            <Input placeholder="请输入服务商名称" />
        </div>
        <div>
            <Typography.Text>API 密钥：</Typography.Text>
            <Input.Password placeholder="请输入API密钥" />
        </div>
        <div>
            <Typography.Text>API 地址：</Typography.Text>
            <Input placeholder="请输入API地址" />
        </div>
    </Flex>;
};

export default Model;