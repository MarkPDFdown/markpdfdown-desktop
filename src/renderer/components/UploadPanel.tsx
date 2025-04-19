import React, { useState, useEffect } from "react";
import {
  Button,
  Col,
  Input,
  Row,
  App,
  Select,
  Space,
  Typography,
  Upload,
  UploadFile,
  UploadProps,
} from "antd";
import { FileMarkdownOutlined, InboxOutlined } from "@ant-design/icons";

const { Text } = Typography;

// 定义模型数据接口
interface ModelType {
  id: string;
  name: string;
  provider: number;
}

interface ModelGroupType {
  provider: number;
  providerName: string;
  models: ModelType[];
}

const UploadPanel: React.FC = () => {
  const { message } = App.useApp();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [modelGroups, setModelGroups] = useState<ModelGroupType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const { Dragger } = Upload;
  const props: UploadProps = {
    onRemove: (file) => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    },
    beforeUpload: () => {
      return false;
    },
    onChange: (info) => {
      setFileList(info.fileList);
    },
    fileList,
  };

  // 获取所有模型数据
  useEffect(() => {
    const fetchAllModels = async () => {
      try {
        setLoading(true);
        const backendPort = window.electron?.backendPort || 3000;
        const response = await fetch(`http://localhost:${backendPort}/api/models`);

        if (!response.ok) {
          throw new Error("获取模型列表失败");
        }

        const data = await response.json();
        setModelGroups(data);
      } catch (error) {
        console.error("获取模型列表出错:", error);
        message.error("获取模型列表失败: " + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    };

    fetchAllModels();
  }, []);

  // 将模型数据转换为Select选项格式
  const getModelOptions = () => {
    const options = modelGroups.map((group) => ({
      label: <span>{group.providerName}</span>,
      title: group.providerName,
      options: group.models.map((model) => ({
        label: <span>{model.name}</span>,
        value: model.id + '@' + model.provider,
      })),
    }));

    // 如果没有数据，提供默认选项
    if (options.length === 0) {
      return [
        {
          label: <span>无可用模型，请在设置中配置模型</span>,
          title: "",
          options: [],
        }
      ];
    }

    return options;
  };

  return (
    <>
      <Row style={{ display: "block", marginTop: "32px" }}>
        <Col span={24}>
          <Dragger
            name="files"
            multiple={true}
            maxCount={10}
            listType="picture"
            action="/api/upload"
            accept=".pdf,.jpg,.png,.bmp"
            {...props}
            style={{ minWidth: "760px" }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">支持单个或批量上传 PDF/JPG/PNG/BMP 文件</p>
          </Dragger>
        </Col>
      </Row>
      <Row style={{ display: "block", marginTop: "24px" }}>
        <Col span={24}>
          <Space>
            <Text>选择模型：</Text>
            <Select
              style={{ width: 240 }}
              options={getModelOptions()}
              loading={loading}
              placeholder="请选择模型"
            />
            <Text>页码范围：</Text>
            <Input style={{ width: 240 }} placeholder="例如：1-10,12（默认全部页面）" />
            <Button type="primary" icon={<FileMarkdownOutlined />}>
              开始转换
            </Button>
          </Space>
        </Col>
      </Row>
    </>
  );
};

export default UploadPanel;
