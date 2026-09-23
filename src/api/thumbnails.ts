import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "node:path";
import { bundlerModuleNameResolver } from "typescript";
import { randomBytes } from "node:crypto";

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const imageData = formData.get("thumbnail");

  if(!(imageData instanceof File)){
    throw new BadRequestError("Invalid image data");
  }

  const MAX_UPLOAD_SIZE = 10 << 20;

  if(imageData.size > MAX_UPLOAD_SIZE){
    throw new BadRequestError("Image size is too large");
  }

  const type = imageData.type;
  const extension = type.slice(6);
  const buffer: ArrayBuffer = await imageData.arrayBuffer();

  const metadata = getVideo(cfg.db, videoId);

  if(metadata?.userID != userID){
    throw new UserForbiddenError("Logged in user does not own video");
  }

  const filePath = path.join(cfg.assetsRoot, `${randomBytes(32).toString("base64url")}.${extension}`)
  Bun.write(filePath, imageData);

  const fullPath = `http://localhost:${cfg.port}/` + filePath;

  metadata.thumbnailURL = fullPath;
  updateVideo(cfg.db, metadata);


  return respondWithJSON(200, metadata);
}
