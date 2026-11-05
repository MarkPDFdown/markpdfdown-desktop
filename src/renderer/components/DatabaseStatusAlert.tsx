import React, { useEffect, useState } from "react";
import { Alert, Typography } from "antd";
import { useTranslation } from "react-i18next";

/**
 * Stays on screen while the database is unavailable. Pages only see the failure as individual
 * requests failing, which doesn't tell the user that the whole app is affected, or why.
 * When the database file is what's failing, restarting can't help, so it explains how to rebuild it.
 */
const DatabaseStatusAlert: React.FC = () => {
  const { t } = useTranslation("common");
  const [error, setError] = useState<string | null>(null);
  const [databasePath, setDatabasePath] = useState<string>();

  useEffect(() => {
    let mounted = true;
    window.api.app
      .getDatabaseStatus()
      .then((status) => {
        if (mounted && !status.success) {
          setError(status.error ?? "");
          setDatabasePath(status.databasePath);
        }
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (error === null) return null;

  return (
    <Alert
      type="error"
      showIcon
      role="alert"
      style={{ margin: "20px 16px 0", flex: "0 0 auto", maxHeight: "40vh", overflow: "auto" }}
      message={t("databaseError.title")}
      description={
        <>
          {databasePath ? (
            <>
              {t("databaseError.rebuild.description")}
              <ol style={{ margin: "8px 0", paddingInlineStart: 24 }}>
                <li>{t("databaseError.rebuild.quit")}</li>
                <li>
                  {t("databaseError.rebuild.moveFile")}
                  <Typography.Paragraph code copyable style={{ marginBottom: 0 }}>
                    {databasePath}
                  </Typography.Paragraph>
                </li>
                <li>{t("databaseError.rebuild.reopen")}</li>
                <li>{t("databaseError.rebuild.stillFailing")}</li>
              </ol>
            </>
          ) : (
            t("databaseError.description")
          )}
          <details>
            <summary>{t("databaseError.details")}</summary>
            <Typography.Paragraph copyable style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
              {error}
            </Typography.Paragraph>
          </details>
        </>
      }
    />
  );
};

export default DatabaseStatusAlert;
