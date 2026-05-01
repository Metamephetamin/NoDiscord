import AnimatedMedia from "./AnimatedMedia";
import { DEFAULT_AVATAR } from "../utils/media";

export default function AnimatedAvatar({ fallback = DEFAULT_AVATAR, ...props }) {
  return <AnimatedMedia fallback={fallback} {...props} />;
}
