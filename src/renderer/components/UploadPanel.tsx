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
  const [uploading, setUploading] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [pageRange, setPageRange] = useState<string>("");
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

  // 处理开始转换按钮点击
  const handleConvert = async () => {
    if (fileList.length === 0) {
      message.error("请先上传文件");
      return;
    }

    if (!selectedModel) {
      message.error("请选择一个模型");
      return;
    }

    try {
      setUploading(true);
      
      // 解析选中的模型ID和提供商ID
      const [modelId, providerIdStr] = selectedModel.split('@');
      const providerId = parseInt(providerIdStr, 10);
      
      // 获取选中的模型名称，模型名称为 模型name@提供商name
      const selectedModelGroup = modelGroups.find(group => group.provider === providerId);
      const providerName = selectedModelGroup?.providerName || "";
      const modelName = selectedModelGroup?.models.find(model => model.id === modelId)?.name + ' | ' + providerName;
      
      // 创建任务列表
      const tasks = fileList.map(file => {
        // 确定文件类型
        const fileType = file.name.split('.').pop()?.toLowerCase() || '';
        
        return {
          filename: file.name,
          type: fileType,
          page_range: pageRange || "",
          pages: 0, // 页数将在后端处理
          provider: providerId,
          model: modelId,
          model_name: modelName
        };
      });
      
      // 发送请求创建任务
      const backendPort = window.electron?.backendPort || 3000;
      const response = await fetch(`http://localhost:${backendPort}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tasks),
      });
      
      if (!response.ok) {
        throw new Error("创建任务失败");
      }
      
      // 获取创建的任务列表
      const createdTasks = await response.json();
      
      // 逐个上传文件，使用任务ID作为文件名
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const task = createdTasks[i];
        
        if (file.originFileObj && task.id) {
          const formData = new FormData();
          formData.append('files', file.originFileObj);
          
          // 使用任务ID作为查询参数
          const uploadResponse = await fetch(`http://localhost:${backendPort}/api/upload?taskId=${task.id}`, {
            method: 'POST',
            body: formData,
          });
          
          if (!uploadResponse.ok) {
            throw new Error(`上传文件 ${file.name} 失败`);
          }
        }
      }
      
      message.success("文件上传成功，已创建转换任务");
      // 清空文件列表
      setFileList([]);
      
    } catch (error) {
      console.error("上传文件出错:", error);
      message.error("上传失败: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setUploading(false);
    }
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
              onChange={(value) => setSelectedModel(value)}
            />
            <Text>页码范围：</Text>
            <Input 
              style={{ width: 240 }} 
              placeholder="例如：1-10,12（默认全部页面）" 
              value={pageRange}
              onChange={(e) => setPageRange(e.target.value)}
            />
            <Button 
              type="primary" 
              icon={<FileMarkdownOutlined />}
              onClick={handleConvert}
              loading={uploading}
              disabled={uploading || fileList.length === 0 || !selectedModel}
            >
              开始转换
            </Button>
          </Space>
        </Col>
      </Row>
    </>
  );
};

export default UploadPanel;
