import React, { useState } from "react";
import { Input, Select, Button, Form, App } from "antd";
import { useTranslation } from "react-i18next";

interface AddProviderProps {
  onProviderAdded?: (providerId: string) => void;
}

const AddProvider: React.FC<AddProviderProps> = ({ onProviderAdded }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState<boolean>(false);
  const { message } = App.useApp();
  const { t } = useTranslation('provider');

  const handleAddProvider = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const response = await window.api.provider.create(values);

      if (!response.success) {
        throw new Error(response.error || t('add_provider.failed'));
      }

      message.success(t('add_provider.success'));
      form.resetFields();

      // 调用回调函数,传递新添加的服务商ID
      if (onProviderAdded && response.data.id) {
        onProviderAdded(response.data.id.toString());
      }
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      } else {
        message.error(t('add_provider.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={form} layout="vertical" style={{ padding: "16px" }}>
      <Form.Item
        name="name"
        label={t('add_provider.name_label')}
        rules={[{ required: true, message: t('add_provider.name_required') }]}
      >
        <Input placeholder={t('add_provider.name_placeholder')} />
      </Form.Item>

      <Form.Item
        name="type"
        label={t('add_provider.type_label')}
        rules={[{ required: true, message: t('add_provider.type_required') }]}
      >
        <Select placeholder={t('add_provider.type_placeholder')}>
          <Select.Option value="openai">OpenAI</Select.Option>
          <Select.Option value="anthropic">Anthropic</Select.Option>
          <Select.Option value="gemini">Gemini</Select.Option>
          <Select.Option value="ollama">Ollama</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item>
        <Button type="primary" onClick={handleAddProvider} loading={loading}>
          {t('add_provider.submit_button')}
        </Button>
      </Form.Item>
    </Form>
  );
};

export default AddProvider;
