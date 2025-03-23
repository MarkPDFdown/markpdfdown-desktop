import React, { useState } from "react";
import {
  Button,
  Col,
  Flex,
  Input,
  Row,
  Select,
  Space,
  Typography,
  Upload,
  UploadFile,
  UploadProps,
} from "antd";
import { FileMarkdownOutlined, InboxOutlined } from "@ant-design/icons";

const { Text } = Typography;

const UploadPanel: React.FC = () => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
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
              defaultValue="anthropic/claude-3.7-sonnet"
              style={{ width: 240 }}
              options={[
                {
                  label: <span>OpenAI</span>,
                  title: "OpenAI",
                  options: [
                    { label: <span>gpt-4o</span>, value: "gpt-4o" },
                    { label: <span>o1-mini</span>, value: "o1-mini" },
                  ],
                },
                {
                  label: <span>OpenRouter</span>,
                  title: "OpenRouter",
                  options: [
                    {
                      label: <span>anthropic/claude-3.7-sonnet</span>,
                      value: "anthropic/claude-3.7-sonnet",
                    },
                    {
                      label: <span>google/gemini-2.0-flash-001</span>,
                      value: "google/gemini-2.0-flash-001",
                    },
                    {
                      label: <span>google/gemma-3-27b-it</span>,
                      value: "google/gemma-3-27b-it",
                    },
                  ],
                },
              ]}
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
