import { Flex, Typography, Button, Space, Badge } from "antd";
import React from "react";
import { useTranslation } from "react-i18next";
import ImgLogo from "../assets/MarkPDFdown.png";

const About: React.FC = () => {
  const { Text, Title } = Typography;
  const { t } = useTranslation('settings');

  return (
    <div
      style={{
        height: "calc(100vh - 180px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Flex
        justify="center"
        align="center"
        vertical
        style={{ flex: "1 1 auto", width: "100%" }}
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
        <Badge.Ribbon text={t('about.version')}>
          <Title level={2}>MarkPDFdown</Title>
        </Badge.Ribbon>
        <Text type="secondary">
          {t('about.subtitle')}
        </Text>
        <Space style={{ marginTop: 16 }}>
          <Button>{t('about.buttons.website')}</Button>
          <Button>{t('about.buttons.license')}</Button>
          <Button>{t('about.buttons.feedback')}</Button>
          <Button>{t('about.buttons.contact')}</Button>
        </Space>
      </Flex>
    </div>
  );
};

export default About;
