import "./user-table.css";

export interface User {
  id: number;
  name: string;
  role: "admin" | "member";
  active: boolean;
}

export interface UserTableProps {
  /**
   * 表示するユーザー。データを受け取るコンポーネントの例
   * @example [{"id":1,"name":"佐藤 美咲","role":"admin","active":true},{"id":2,"name":"田中 健","role":"member","active":true},{"id":3,"name":"鈴木 陽子","role":"member","active":false}]
   */
  users: User[];
  caption?: string;
}

const ROLE: Record<User["role"], string> = { admin: "管理者", member: "メンバー" };

export function UserTable({ users, caption }: UserTableProps) {
  return (
    <table className="app-user-table">
      {caption && <caption>{caption}</caption>}
      <thead>
        <tr>
          <th>名前</th>
          <th>ロール</th>
          <th>状態</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>{user.name}</td>
            <td>{ROLE[user.role] ?? user.role}</td>
            <td>
              <span className="app-user-table-status" data-active={user.active || undefined}>
                {user.active ? "有効" : "停止中"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
