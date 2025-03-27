import { Flex, Typography, Button, Space, Badge } from "antd";
import React from "react";
import ImgLogo from "../assets/MarkPDFdown.png";

const About: React.FC = () => {
  const { Text, Title } = Typography;

  return (
    <Flex
      justify="center"
      align="center"
      vertical
      style={{ flex: "1 1 auto", width: "100%", height: "100%" }}
    >
      <img
        src={ImgLogo}
        alt="MarkPDFdown"
        width={100}
        height={100}
        style={{
          borderRadius: "20%",
          boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.15)",
        }}
        draggable={false}
      />
      <Badge.Ribbon text="v1.0.6">
        <Title level={2}>MarkPDFdown</Title>
      </Badge.Ribbon>
      <Text type="secondary">
        一款基于大模型视觉识别的高质量PDF转Markdown工具
      </Text>
      <Space style={{ marginTop: 16 }}>
        <Button>官方网址</Button>
        <Button>许可协议</Button>
        <Button>意见反馈</Button>
        <Button>联系邮件</Button>
      </Space>
    </Flex>
  );
};

export default About;
