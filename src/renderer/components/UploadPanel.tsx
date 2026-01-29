import React, { useState, useEffect, useContext } from "react";
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
  Tooltip
} from "antd";
import { FileMarkdownOutlined, InboxOutlined, CloudOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CloudContext } from "../contexts/CloudContextDefinition";

const { Text } = Typography;

// Cloud Constants
const CLOUD_PROVIDER_ID = -1;
const CLOUD_MODEL_ID = "markpdfdown-cloud";

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

const SELECTED_MODEL_KEY = "markpdfdown_selected_model";

const UploadPanel: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useTranslation('upload');
  const cloudContext = useContext(CloudContext);

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [modelGroups, setModelGroups] = useState<ModelGroupType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [pageRange, setPageRange] = useState<string>("");
  const { Dragger } = Upload;

  // 获取所有模型数据
  useEffect(() => {
    const fetchAllModels = async () => {
      try {
        setLoading(true);
        const result = await window.api.model.getAll();

        let groups: ModelGroupType[] = [];
        if (result.success && result.data) {
          groups = result.data;
        } else {
          message.error(result.error || t('messages.fetch_models_failed'));
        }

        // Inject Cloud Model
        const cloudGroup: ModelGroupType = {
          provider: CLOUD_PROVIDER_ID,
          providerName: t('cloud.provider_name'),
          models: [{
            id: CLOUD_MODEL_ID,
            name: t('cloud.model_name'),
            provider: CLOUD_PROVIDER_ID
          }]
        };

        // Add cloud group to the beginning
        groups = [cloudGroup, ...groups];
        setModelGroups(groups);

        // 尝试恢复上次选择的模型
        const savedModel = localStorage.getItem(SELECTED_MODEL_KEY);
        if (savedModel) {
          // 检查保存的模型是否在当前列表中存在
          const modelExists = groups.some((group: ModelGroupType) =>
            group.models.some(
              (model: ModelType) => `${model.id}@${model.provider}` === savedModel
            )
          );
          if (modelExists) {
            setSelectedModel(savedModel);
          }
        }

      } catch (error) {
        console.error("Failed to fetch model list:", error);
        message.error(
          t('messages.fetch_models_failed') + ": " +
            (error instanceof Error ? error.message : String(error)),
        );
      } finally {
        setLoading(false);
      }
    };

    fetchAllModels();
  }, [message, t]);

  // 处理模型选择变化
  const handleModelChange = (value: string) => {
    setSelectedModel(value);
    localStorage.setItem(SELECTED_MODEL_KEY, value);
  };

  // 将模型数据转换为Select选项格式
  const getModelOptions = () => {
    const options = modelGroups.map((group) => {
      const isCloud = group.provider === CLOUD_PROVIDER_ID;
      const isDisabled = isCloud && !cloudContext?.isAuthenticated;

      return {
        label: (
          <span>
            {isCloud && <CloudOutlined style={{ marginRight: 8, color: '#1890ff' }} />}
            {group.providerName}
          </span>
        ),
        title: group.providerName,
        options: group.models.map((model) => ({
          label: (
            <Tooltip title={isDisabled ? t('cloud.sign_in_required') : ""}>
              <span style={isDisabled ? { color: '#d9d9d9', cursor: 'not-allowed' } : {}}>
                 {model.name} {isCloud && t('cloud.credits_apply')}
              </span>
            </Tooltip>
          ),
          value: model.id + "@" + model.provider,
          disabled: isDisabled
        })),
      };
    });

    // 如果没有数据，提供默认选项
    if (options.length === 0) {
      return [
        {
          label: <span>{t('form.model_empty')}</span>,
          title: "",
          options: [],
        },
      ];
    }

    return options;
  };

  // 处理文件选择（使用文件对话框）
  const handleFileSelect = async () => {
    try {
      const dialogResult = await window.api.file.selectDialog();

      if (
        dialogResult.success &&
        dialogResult.data &&
        !dialogResult.data.canceled &&
        dialogResult.data.filePaths.length > 0
      ) {
        // 将选中的文件路径转换为 UploadFile 格式
        const newFiles: UploadFile[] = dialogResult.data.filePaths.map(
          (filePath: string, index: number) => {
            // 从文件路径中提取文件名
            const fileName = filePath.split(/[\\/]/).pop() || filePath;

            return {
              uid: `${Date.now()}-${index}`,
              name: fileName,
              status: "done",
              // 存储原始文件路径，用于后续上传
              url: filePath,
            };
          },
        );

        setFileList([...fileList, ...newFiles]);
      }
    } catch (error) {
      console.error("Failed to select files:", error);
      message.error(
        t('messages.select_failed') + ": " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  const props: UploadProps = {
    onRemove: (file) => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    },
    beforeUpload: (file) => {
      // 检查文件类型
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (!isPDF) {
        message.error(t('messages.invalid_file_type', { filename: file.name }));
        return Upload.LIST_IGNORE;
      }

      // 将拖放的文件添加到文件列表
      const newFile: UploadFile = {
        uid: `${Date.now()}-${Math.random()}`,
        name: file.name,
        status: "done",
        // 存储原始文件对象用于后续处理
        originFileObj: file as any,
      };

      // 使用函数式 setState 确保正确处理多文件上传
      setFileList((prevList) => [...prevList, newFile]);

      // 阻止默认上传行为，我们将自己处理文件上传
      return false;
    },
    fileList,
    showUploadList: true,
    accept: '.pdf',
    multiple: true,
  };

  // 处理开始转换按钮点击
  const handleConvert = async () => {
    if (fileList.length === 0) {
      message.error(t('messages.no_files'));
      return;
    }

    if (!selectedModel) {
      message.error(t('messages.no_model'));
      return;
    }

    try {
      setUploading(true);

      // 解析选中的模型ID和提供商ID
      const [modelId, providerIdStr] = selectedModel.split("@");
      const providerId = parseInt(providerIdStr, 10);

      // Check if it is a cloud conversion
      if (providerId === CLOUD_PROVIDER_ID) {
        if (!cloudContext) {
          throw new Error("Cloud context not initialized");
        }

        let successCount = 0;
        for (const file of fileList) {
          const result = await cloudContext.convertFile(file);
          if (result.success) {
            successCount++;
          } else {
            message.error(t('cloud.upload_failed', { filename: file.name, error: result.error }));
          }
        }

        if (successCount > 0) {
          message.success(t('cloud.upload_success', { count: successCount }));
          setFileList([]);
          navigate("/list", { replace: true });
        }
        return;
      }

      // 获取选中的模型名称，模型名称为 模型name@提供商name
      const selectedModelGroup = modelGroups.find(
        (group) => group.provider === providerId,
      );
      const providerName = selectedModelGroup?.providerName || "";
      const modelName =
        selectedModelGroup?.models.find((model) => model.id === modelId)?.name +
        " | " +
        providerName;

      // 创建任务列表
      const tasks = fileList.map((file) => {
        // 确定文件类型（从文件名中提取扩展名）
        const fileType = file.name.split(".").pop()?.toLowerCase() || "";

        return {
          filename: file.name,
          type: fileType,
          page_range: pageRange || "",
          pages: 0, // 页数将在后端处理
          provider: providerId,
          model: modelId,
          model_name: modelName,
        };
      });

      // 使用新的 IPC API 创建任务
      const createResult = await window.api.task.create(tasks);

      if (!createResult.success || !createResult.data) {
        throw new Error(createResult.error || t('messages.create_task_failed'));
      }

      // 获取创建的任务列表
      const createdTasks = createResult.data;

      let successCount = 0;
      // 逐个上传文件，使用任务ID和文件路径
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const task = createdTasks[i];

        if (!task.id) {
          continue;
        }

        try {
          let uploadResult;

          // 区分文件来源：通过对话框选择的文件有 url 属性（文件路径）
          if (file.url) {
            // 使用文件路径上传（文件对话框选择）
            uploadResult = await window.api.file.upload(task.id, file.url);
          } else if (file.originFileObj) {
            // 使用文件内容上传（拖放上传）
            const fileContent = await file.originFileObj.arrayBuffer();
            uploadResult = await window.api.file.uploadFileContent(
              task.id,
              file.name,
              fileContent,
            );
          } else {
            message.error(t('messages.invalid_file_path', { filename: file.name }));
            await window.api.task.delete(task.id);
            continue;
          }

          if (uploadResult.success) {
            // 修改任务状态为待处理
            const updateResult = await window.api.task.update(task.id, {
              status: 1,
            });

            if (updateResult.success) {
              successCount++;
            } else {
              message.error(t('messages.update_status_failed', { filename: file.name }));
              // 删除任务
              await window.api.task.delete(task.id);
            }
          } else {
            message.error(
              t('messages.upload_failed', { filename: file.name }) + `: ${uploadResult.error || "Unknown error"}`,
            );
            // 删除任务
            await window.api.task.delete(task.id);
          }
        } catch (error) {
          console.error(`Failed to upload file ${file.name}:`, error);
          message.error(t('messages.upload_failed', { filename: file.name }));
          // 删除任务
          await window.api.task.delete(task.id);
        }
      }

      if (successCount > 0) {
        message.success(t('messages.tasks_created', { count: successCount }));
        // 清空文件列表
        setFileList([]);
        navigate("/list", { replace: true });
      } else {
        message.error(t('messages.upload_error'));
      }
    } catch (error) {
      console.error("Failed to upload files:", error);
      message.error(
        t('messages.upload_error') + ": " + (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Row style={{ display: "block", marginTop: "32px" }}>
        <Col span={24}>
          <Dragger {...props} style={{ minWidth: "760px" }}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">{t('dragger.text')}</p>
            <p className="ant-upload-hint">
              {t('dragger.hint')}
            </p>
            <Button
              type="primary"
              onClick={(e) => {
                e.stopPropagation();
                handleFileSelect();
              }}
              style={{ marginTop: 16 }}
            >
              {t('dragger.button')}
            </Button>
          </Dragger>
        </Col>
      </Row>
      <Row style={{ display: "block", marginTop: "24px" }}>
        <Col span={24}>
          <Space>
            <Text>{t('form.model_label')}</Text>
            <Select
              style={{ width: 240 }}
              options={getModelOptions()}
              loading={loading}
              placeholder={t('form.model_placeholder')}
              value={selectedModel || undefined}
              onChange={handleModelChange}
            />
            <Text>{t('form.page_range_label')}</Text>
            <Input
              style={{ width: 240 }}
              placeholder={t('form.page_range_placeholder')}
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
              {t('form.convert_button')}
            </Button>
          </Space>
        </Col>
      </Row>
    </>
  );
};

export default UploadPanel;
