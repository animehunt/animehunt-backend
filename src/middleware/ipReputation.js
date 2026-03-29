export async function updateScore(DB, ip, points = 1) {

  const row = await DB.prepare(
    "SELECT score FROM ip_scores WHERE ip=?"
  ).bind(ip).first()

  let score = row?.score || 0
  score += points

  await DB.prepare(`
    INSERT OR REPLACE INTO ip_scores(ip,score)
    VALUES(?,?)
  `).bind(ip, score).run()

  return score
}
