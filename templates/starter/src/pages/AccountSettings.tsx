import "../tokens.css";

import { Stack } from "../components/stack/Stack";
import { PageHeader } from "../components/page-header/PageHeader";
import { Card } from "../components/card/Card";
import { TextField } from "../components/text-field/TextField";
import { Button } from "../components/button/Button";

export default function AccountSettings() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: 24 }}>
      <Stack gap="large">
        <PageHeader
          title="アカウント設定"
          description="プロフィールとパスワードを変更できます"
        />
        <Card title="プロフィール">
          <Stack direction="row">
            <TextField label="氏名" placeholder="山田 太郎" required />
            <TextField label="表示名" placeholder="やまだ" />
          </Stack>
          <TextField
            label="メールアドレス"
            placeholder="name@example.com"
            hint="ログインと通知に使います"
            required
          />
          <TextField label="部署" placeholder="プロダクト開発部" />
        </Card>
        <Card title="パスワード">
          <TextField label="現在のパスワード" />
          <TextField
            label="新しいパスワード"
            error="8 文字以上にしてください"
          />
        </Card>
        <Stack direction="row" gap="small" align="center">
          <Button>保存する</Button>
          <Button variant="outline">キャンセル</Button>
        </Stack>
      </Stack>
    </div>
  );
}
