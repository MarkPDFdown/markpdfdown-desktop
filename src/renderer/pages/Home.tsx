import React from "react";
import ImgLogo from "../assets/MarkPDFdown.png";
import { Flex, Typography } from "antd";
import { useTranslation } from "react-i18next";
import UploadPanel from "../components/UploadPanel";
import LanguageSwitcher from "../components/LanguageSwitcher";

const Home: React.FC = () => {
  const { Text, Title } = Typography;
  const { t } = useTranslation('home');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10 }}>
        <LanguageSwitcher />
      </div>
      <Flex
        justify="center"
        align="center"
        vertical
        style={{ flex: "1 1 auto", width: "100%", height: "100%" }}
      >
        <p>
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
        </p>
        <Title level={2}>{t('title')}</Title>
        <Text type="secondary">
          {t('subtitle')}
        </Text>
        <UploadPanel />
      </Flex>
    </div>
  );
};

export default Home;
