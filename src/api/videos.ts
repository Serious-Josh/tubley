import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { randomBytes } from "crypto";
import path from "path";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const MAX_UPLOAD_SIZE = 1 << 30;

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const metadata = getVideo(cfg.db, videoId);

  if(metadata?.userID != userID){
    throw new UserForbiddenError("Logged in user does not own video");
  }

  const formData = await req.formData();
  const videoData = formData.get("video");

  if(!(videoData instanceof File)){
    throw new BadRequestError("Invalid video data");
  }

  if(videoData.size > MAX_UPLOAD_SIZE){
    throw new BadRequestError("Video size is too large");
  }

  if(videoData.type != "video/mp4"){
    throw new BadRequestError("Invalid video format");
  }

  const filePath = path.join(cfg.assetsRoot, `${randomBytes(32).toString("base64url")}.mp4`)
  await Bun.write(filePath, videoData);

  const file = cfg.s3client.file(`${videoId}.mp4`, {type: "video/mp4"});
  await file.write(Bun.file(filePath));

  metadata.videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${videoId}.mp4`;
  updateVideo(cfg.db, metadata);

  await Bun.file(filePath).delete();

  return respondWithJSON(200, metadata);
}
