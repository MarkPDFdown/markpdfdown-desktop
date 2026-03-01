import { Flex, Typography, Button, Space, Badge } from "antd";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ImgLogo from "../assets/MarkPDFdown.png";
import UpdateChecker from "./UpdateChecker";

const About: React.FC = () => {
  const { Text, Title } = Typography;
  const { t } = useTranslation('settings');
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    window.api.app.getVersion().then((v) => setVersion(v));
  }, []);

  const handleOpenLink = (url: string) => {
    window.open(url, '_blank');
  };

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
        <Badge.Ribbon text={version ? `v${version}` : ''}>
          <Title level={2}>MarkPDFdown</Title>
        </Badge.Ribbon>
        <Text type="secondary">
          {t('about.subtitle')}
        </Text>
        <Space style={{ marginTop: 16 }}>
          <Button onClick={() => handleOpenLink('https://markdown.fit')}>
            {t('about.buttons.website')}
          </Button>
          <Button onClick={() => handleOpenLink('https://github.com/MarkPDFdown/markpdfdown-desktop/blob/master/LICENSE')}>
            {t('about.buttons.license')}
          </Button>
          <Button onClick={() => handleOpenLink('https://github.com/MarkPDFdown/markpdfdown-desktop/issues')}>
            {t('about.buttons.feedback')}
          </Button>
          <Button onClick={() => handleOpenLink('mailto:jorben@aix.me')}>
            {t('about.buttons.contact')}
          </Button>
        </Space>
        <UpdateChecker />
      </Flex>
    </div>
  );
};

export default About;
