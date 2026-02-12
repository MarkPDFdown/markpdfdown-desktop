import React, { useEffect, useState } from "react";
import { Button, Progress, Space, Typography } from "antd";
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";

const { Text } = Typography;

type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not_available"
  | "downloading"
  | "downloaded"
  | "error";

interface UpdateStatusData {
  status: UpdateStatus;
  version?: string;
  progress?: number;
  error?: string;
}

const UpdateChecker: React.FC = () => {
  const { t } = useTranslation("settings");
  const [statusData, setStatusData] = useState<UpdateStatusData>({
    status: "idle",
  });

  useEffect(() => {
    const cleanup = window.api.events.onUpdaterStatus(
      (data: UpdateStatusData) => {
        setStatusData(data);
      },
    );
    return cleanup;
  }, []);

  const handleCheckForUpdates = () => {
    setStatusData({ status: "checking" });
    window.api.updater.checkForUpdates();
  };

  const handleQuitAndInstall = () => {
    window.api.updater.quitAndInstall();
  };

  const renderStatus = () => {
    switch (statusData.status) {
      case "checking":
        return (
          <Space>
            <SyncOutlined spin />
            <Text type="secondary">{t("update.checking")}</Text>
          </Space>
        );

      case "available":
        return (
          <Space>
            <DownloadOutlined />
            <Text>
              {t("update.available")}{" "}
              {statusData.version && `(v${statusData.version})`}
            </Text>
          </Space>
        );

      case "downloading":
        return (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Text>
              {t("update.downloading")}{" "}
              {statusData.progress !== undefined &&
                `${statusData.progress.toFixed(1)}%`}
            </Text>
            <Progress
              percent={Math.round(statusData.progress ?? 0)}
              size="small"
            />
          </Space>
        );

      case "downloaded":
        return (
          <Space>
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
            <Text>
              {t("update.ready")}{" "}
              {statusData.version && `(v${statusData.version})`}
            </Text>
            <Button type="primary" onClick={handleQuitAndInstall}>
              {t("update.restart_to_update")}
            </Button>
          </Space>
        );

      case "not_available":
        return (
          <Space>
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
            <Text type="secondary">{t("update.up_to_date")}</Text>
          </Space>
        );

      case "error":
        return (
          <Space>
            <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
            <Text type="danger">{t("update.error")}</Text>
            <Button onClick={handleCheckForUpdates}>{t("update.retry")}</Button>
          </Space>
        );

      case "idle":
      default:
        return (
          <Button onClick={handleCheckForUpdates}>
            {t("update.check_for_updates")}
          </Button>
        );
    }
  };

  return <div style={{ marginTop: 16 }}>{renderStatus()}</div>;
};

export default UpdateChecker;
