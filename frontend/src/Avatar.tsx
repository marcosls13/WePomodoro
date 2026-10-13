import { avatarUrl } from "./api";

export default function Avatar({
  id,
  size = 44,
  version = 0,
}: {
  id: number;
  size?: number;
  version?: number;
}) {
  return (
    <img
      className="avatar-img"
      src={avatarUrl(id, version)}
      width={size}
      height={size}
      alt=""
    />
  );
}
