import type { CSSProperties } from 'react';

/** プロフィール名の先頭 1 文字（サロゲートペア・絵文字も 1 文字として扱う） */
export function profileInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

/** 識別色の丸に頭文字を載せたアバター。装飾扱いで、名前は隣のテキストで伝える */
export const ProfileAvatar = ({ name, color, size = 28 }: { name: string; color: string; size?: number }) => (
  <span
    className="avatar"
    aria-hidden="true"
    style={{ '--profile-color': color, '--avatar-size': `${size}px` } as CSSProperties}
  >
    {profileInitial(name)}
  </span>
);
