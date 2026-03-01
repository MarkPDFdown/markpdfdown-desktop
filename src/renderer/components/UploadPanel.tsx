import React, { useState, useEffect, useContext, useMemo } from "react";
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
import { FileMarkdownOutlined, InboxOutlined, CloudOutlined, LoginOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CloudContext } from "../contexts/CloudContextDefinition";

const { Text } = Typography;

// Cloud Constants
const CLOUD_PROVIDER_ID = -1;

// Cloud model tiers matching server API: lite, pro, ultra
// Format: "Fit Lite (约10积分/页)"
const CLOUD_MODEL_TIERS = [
  { id: 'lite', name: 'Fit Lite', creditsPerPage: 10 },
  { id: 'pro', name: 'Fit Pro', creditsPerPage: 20 },
  { id: 'ultra', name: 'Fit Ultra', creditsPerPage: 60 },
] as const;

type CloudModelTier = typeof CLOUD_MODEL_TIERS[number]['id'];

// Supported Office file extensions
const OFFICE_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'gif'];

type FileCategory = 'pdf' | 'image' | 'office' | 'unsupported';

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

// Check if current selection supports Office files (requires: logged in + cloud model selected)
const supportsOfficeFiles = (
  isAuthenticated: boolean | undefined,
  selectedModel: string
): boolean => {
  if (!isAuthenticated || !selectedModel) return false;
  const [, providerIdStr] = selectedModel.split("@");
  const providerId = parseInt(providerIdStr, 10);
  return providerId === CLOUD_PROVIDER_ID;
};

const getFileCategory = (fileName: string, fileType?: string): FileCategory => {
  const fileNameLower = fileName.toLowerCase();
  const mimeType = fileType?.toLowerCase();

  if (mimeType === 'application/pdf' || fileNameLower.endsWith('.pdf')) {
    return 'pdf';
  }

  if ((mimeType?.startsWith('image/') ?? false) || IMAGE_EXTENSIONS.some(ext => fileNameLower.endsWith(`.${ext}`))) {
    return 'image';
  }

  if (OFFICE_EXTENSIONS.some(ext => fileNameLower.endsWith(`.${ext}`))) {
    return 'office';
  }

  return 'unsupported';
};

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

  // Determine if Office files are supported based on current selection
  const canUseOfficeFiles = useMemo(
    () => supportsOfficeFiles(cloudContext?.isAuthenticated, selectedModel),
    [cloudContext?.isAuthenticated, selectedModel]
  );
  const isAuthenticated = Boolean(cloudContext?.isAuthenticated);
  const draggerHint = canUseOfficeFiles
    ? t('dragger.hint_cloud_logged_in')
    : isAuthenticated
      ? t('dragger.hint_logged_in_non_cloud')
      : t('dragger.hint_local');

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

        // Inject Cloud Models (lite, pro, ultra tiers)
        // Format: "Fit Lite (~10 credits/page)" with i18n
        const cloudGroup: ModelGroupType = {
          provider: CLOUD_PROVIDER_ID,
          providerName: t('cloud.provider_name'),
          models: CLOUD_MODEL_TIERS.map(tier => ({
            id: tier.id,
            name: `${tier.name} (${t(`cloud.tier_${tier.id}`)})`,
            provider: CLOUD_PROVIDER_ID
          }))
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
                 {model.name}
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
      const dialogResult = await window.api.file.selectDialog(canUseOfficeFiles);

      if (
        dialogResult.success &&
        dialogResult.data &&
        !dialogResult.data.canceled &&
        dialogResult.data.filePaths.length > 0
      ) {
        // 二次校验对话框返回的文件，避免通过系统对话框绕过类型限制
        const rejectedOfficeFiles: string[] = [];
        const rejectedUnsupportedFiles: string[] = [];
        const newFiles: UploadFile[] = [];

        dialogResult.data.filePaths.forEach((filePath: string, index: number) => {
          const fileName = filePath.split(/[\\/]/).pop() || filePath;
          const category = getFileCategory(fileName);

          if (category === 'unsupported') {
            rejectedUnsupportedFiles.push(fileName);
            return;
          }

          if (category === 'office' && !canUseOfficeFiles) {
            rejectedOfficeFiles.push(fileName);
            return;
          }

          newFiles.push({
            uid: `${Date.now()}-${index}`,
            name: fileName,
            status: "done",
            // 存储原始文件路径，用于后续上传
            url: filePath,
          });
        });

        if (rejectedUnsupportedFiles.length > 0) {
          message.error(t('messages.invalid_file_type', { filename: rejectedUnsupportedFiles.join(', ') }));
        }

        if (rejectedOfficeFiles.length > 0) {
          message.error(t('messages.office_not_supported', { filename: rejectedOfficeFiles.join(', ') }));
        }

        if (newFiles.length > 0) {
          setFileList((prevList) => [...prevList, ...newFiles]);
        }
      }
    } catch (error) {
      console.error("Failed to select files:", error);
      message.error(
        t('messages.select_failed') + ": " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  // Dynamic accept attribute based on whether Office files are supported
  const baseAcceptExtensions = ['.pdf', ...IMAGE_EXTENSIONS.map((ext) => `.${ext}`)];
  const acceptExtensions = canUseOfficeFiles
    ? [...baseAcceptExtensions, ...OFFICE_EXTENSIONS.map((ext) => `.${ext}`)].join(',')
    : baseAcceptExtensions.join(',');

  const props: UploadProps = {
    onRemove: (file) => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    },
    beforeUpload: (file) => {
      const category = getFileCategory(file.name, file.type);

      if (category === 'unsupported') {
        message.error(t('messages.invalid_file_type', { filename: file.name }));
        return Upload.LIST_IGNORE;
      }

      // If Office file but not supported in current mode
      if (category === 'office' && !canUseOfficeFiles) {
        message.error(t('messages.office_not_supported', { filename: file.name }));
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
    accept: acceptExtensions,
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
        const modelTier = modelId as CloudModelTier;
        for (const file of fileList) {
          const result = await cloudContext.convertFile({
            name: file.name,
            url: file.url,
            originFileObj: file.originFileObj as File | undefined
          }, modelTier, pageRange || undefined);
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
              {draggerHint}
            </p>
            {!canUseOfficeFiles && !isAuthenticated && (
              <p style={{ marginTop: 8, color: '#faad14' }}>
                <LoginOutlined style={{ marginRight: 4 }} />
                {t('dragger.login_hint')}
              </p>
            )}
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
