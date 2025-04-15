import React, { useState } from 'react';
import { Input, Select, Button, message, Form } from 'antd';

interface AddProviderProps {
    onProviderAdded?: (providerId: string) => void;
}

const AddProvider: React.FC<AddProviderProps> = ({ onProviderAdded }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState<boolean>(false);
    const [messageApi, contextHolder] = message.useMessage();

    const handleAddProvider = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            const backendPort = window.electron?.backendPort || 3000;
            const response = await fetch(`http://localhost:${backendPort}/api/providers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(values),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '添加服务商失败');
            }

            messageApi.success('服务商添加成功');
            form.resetFields();
            
            // 调用回调函数，传递新添加的服务商ID
            if (onProviderAdded && data.id) {
                onProviderAdded(data.id.toString());
            }
        } catch (error) {
            if (error instanceof Error) {
                messageApi.error(error.message);
            } else {
                messageApi.error('添加服务商失败');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {contextHolder}
            <Form form={form} layout="vertical" style={{ padding: '16px' }}>
                <Form.Item
                    name="name"
                    label="服务商名称"
                    rules={[{ required: true, message: '请输入服务商名称' }]}
                >
                    <Input placeholder="请输入服务商名称" />
                </Form.Item>

                <Form.Item
                    name="type"
                    label="协议类型"
                    rules={[{ required: true, message: '请选择协议类型' }]}
                >
                    <Select placeholder="请选择协议类型">
                        <Select.Option value="openai">OpenAI</Select.Option>
                        <Select.Option value="anthropic">Anthropic</Select.Option>
                        <Select.Option value="gemini">Gemini</Select.Option>
                        <Select.Option value="azure-openai">Azure OpenAI</Select.Option>
                        <Select.Option value="groq">Groq</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item>
                    <Button
                        type="primary"
                        onClick={handleAddProvider}
                        loading={loading}
                    >
                        确认添加
                    </Button>
                </Form.Item>
            </Form>
        </>
    );
};

export default AddProvider;