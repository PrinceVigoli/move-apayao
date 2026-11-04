import { imageSize } from "image-size";

// Small, re-encoded JPEGs fit within the existing 256KB request limit and user
// avatar column. No external URLs, filesystem paths or executable formats.
export function validProfilePhoto(value: string): boolean {
  if (value === "") return true;
  if (
    value.length > 180_000 ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    return false;
  try {
    const bytes = Buffer.from(
      value.slice("data:image/jpeg;base64,".length),
      "base64",
    );
    const size = imageSize(bytes);
    return (
      bytes.length <= 130_000 &&
      size.type === "jpg" &&
      !!size.width &&
      !!size.height &&
      size.width <= 512 &&
      size.height <= 512
    );
  } catch {
    return false;
  }
}
