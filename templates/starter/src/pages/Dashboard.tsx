import "../tokens.css";

import { Stack } from "../components/stack/Stack";
import { PageHeader } from "../components/page-header/PageHeader";
import { Button } from "../components/button/Button";
import { Stat } from "../components/stat/Stat";
import { Card } from "../components/card/Card";
import { Alert } from "../components/alert/Alert";
import { UserTable } from "../components/user-table/UserTable";

export default function Dashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: 24 }}>
      <Stack gap="large">
        <PageHeader
          title="ダッシュボード"
          description="今月の主要な指標"
        >
          <Button variant="outline">CSV を書き出す</Button>
        </PageHeader>
        <Stack direction="row" wrap>
          <Stat
            label="今月の売上"
            value="¥12,480,000"
            change="+8.2%"
            trend="up"
          />
          <Stat
            label="新規ユーザー"
            value="1,284"
            change="+3.1%"
            trend="up"
          />
          <Stat
            label="解約率"
            value="2.4%"
            change="+0.3pt"
            trend="down"
          />
          <Stat label="平均応答時間" value="1.8 秒" change="±0" />
        </Stack>
        <Stack direction="row" wrap>
          <Card title="お知らせ">
            <Alert title="新しいレポートを追加しました">
              「設定 → レポート」から有効にできます。
            </Alert>
            <Alert tone="warning" title="お支払い情報の更新が必要です">
              登録中のカードの有効期限が近づいています。
            </Alert>
          </Card>
          <Card title="最近追加されたメンバー">
            <UserTable
              users={[{"id":1,"name":"伊藤 さくら","role":"admin","active":true},{"id":2,"name":"高橋 翔","role":"member","active":false},{"id":3,"name":"鈴木 陽子","role":"member","active":true}]}
            />
          </Card>
        </Stack>
      </Stack>
    </div>
  );
}
