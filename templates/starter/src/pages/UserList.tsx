import "../tokens.css";

import { Stack } from "../components/stack/Stack";
import { PageHeader } from "../components/page-header/PageHeader";
import { Button } from "../components/button/Button";
import { Alert } from "../components/alert/Alert";
import { Tag } from "../components/tag/Tag";
import { Card } from "../components/card/Card";
import { UserTable } from "../components/user-table/UserTable";

export default function UserList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: 24 }}>
      <Stack gap="large">
        <PageHeader
          title="ユーザー一覧"
          description="チームのメンバーと権限を管理します"
        >
          <Button>ユーザーを招待</Button>
        </PageHeader>
        <Alert tone="warning" title="承認待ちの招待が 2 件あります">
          招待メールの有効期限は 7 日間です。
        </Alert>
        <Stack direction="row" gap="small" align="center">
          <Tag label="すべて" />
          <Tag label="管理者" />
          <Tag label="メンバー" />
          <Tag label="停止中" />
        </Stack>
        <Card title="メンバー">
          <UserTable
            users={[{"id":1,"name":"佐藤 美咲","role":"admin","active":true},{"id":2,"name":"田中 健","role":"member","active":true},{"id":3,"name":"鈴木 陽子","role":"member","active":true},{"id":4,"name":"高橋 翔","role":"member","active":false},{"id":5,"name":"伊藤 さくら","role":"admin","active":true}]}
          />
        </Card>
      </Stack>
    </div>
  );
}
