import { applyDisplayRange, extractMedia, normalizeQuote } from "../_twitter/normalize"
import type { FxAuthor, FxStatus, NormalizedTweet, ProfileInfo } from "./types"

export const normalizeProfile = (user: FxAuthor): ProfileInfo => ({
  handle: user.screen_name,
  name: user.name,
  // `user.description` already has t.co URLs expanded to their final destinations;
  // `raw_description.text` keeps the t.co form, which is useless for humans.
  description: user.description ?? "",
  followers: user.followers ?? 0,
  statuses: user.statuses ?? 0,
  avatarUrl: user.avatar_url,
})

export const normalizeStatus = (status: FxStatus): NormalizedTweet => {
  const rt = status.raw_text
  const { text, facets } = applyDisplayRange(rt ?? { text: status.text })
  const isRetweet = Boolean(status.reposted_by)

  const normalized: NormalizedTweet = {
    id: status.id,
    createdAt: new Date(status.created_timestamp * 1000),
    permalink: status.url,
    author: { handle: status.author.screen_name, name: status.author.name },
    text,
    facets,
    media: extractMedia(status),
    isRetweet,
  }

  if (isRetweet && status.reposted_by) {
    normalized.repostedBy = {
      handle: status.reposted_by.screen_name,
      name: status.reposted_by.name,
    }
  }

  if (status.replying_to) normalized.replyTo = { handle: status.replying_to.screen_name }

  if (status.quote) normalized.quote = normalizeQuote(status.quote)

  return normalized
}
