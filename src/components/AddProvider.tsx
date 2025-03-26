import React from 'react';
import { Input, Typography, Flex, Select, Button } from 'antd';

const AddProvider: React.FC = () => {
    return <Flex vertical gap={16} style={{ padding: '16px' }}>
        <div>
            <Typography.Text>服务商名称：</Typography.Text>
            <Input placeholder="请输入服务商名称" />
        </div>
        <div>
            <Typography.Text>协议类型：</Typography.Text>
            <Select style={{ width: '100%' }} placeholder="请选择协议类型">
                <Select.Option value="openai">OpenAI</Select.Option>
                <Select.Option value="anthropic">Anthropic</Select.Option>
                <Select.Option value="gemini">Gemini</Select.Option>
                <Select.Option value="azure-openai">Azure OpenAI</Select.Option>
                <Select.Option value="groq">Groq</Select.Option>
            </Select>
        </div>
        <div>
            <Button type="primary">确认添加</Button>
        </div>
    </Flex>;
};

export default AddProvider;