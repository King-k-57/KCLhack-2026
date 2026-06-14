/**
 * 島ガチャ — スコア計算エンジン
 *
 * 使い方:
 *   javac ScoreCalculator.java
 *   java ScoreCalculator <guessLat> <guessLng> <ansLat> <ansLng> <timeSeconds>
 *
 * 出力 (JSON):
 *   {"distance_km":42.3,"distance_score":46,"time_seconds":15.2,"time_bonus":22,"total_score":68}
 *
 * スコア計算ルール:
 *   距離スコア (最大70点): 70 × e^(-距離km / 100)
 *   タイムボーナス (最大30点): max(0, 30 - (秒数 / 2))
 *   ラウンド合計 (最大100点): 距離スコア + タイムボーナス
 */
public class ScoreCalculator {

    /**
     * Haversine 公式で2点間の距離を計算（km）
     */
    public static double haversine(double lat1, double lng1, double lat2, double lng2) {
        final double R = 6371.0; // 地球の半径 (km)

        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1))
                 * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLng / 2) * Math.sin(dLng / 2);

        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * 距離スコアを計算（最大70点）
     * 距離が近いほど高得点
     */
    public static int calcDistanceScore(double distanceKm) {
        if (distanceKm < 0.5) {
            return 70; // 500m以内は満点
        }
        int score = (int) Math.round(70.0 * Math.exp(-distanceKm / 100.0));
        return Math.max(0, Math.min(70, score));
    }

    /**
     * タイムボーナスを計算（最大30点）
     * 早く回答するほど高得点
     *   0〜10秒:  30〜25点
     *   10〜30秒: 25〜15点
     *   30〜60秒: 15〜0点
     *   60秒以上: 0点
     */
    public static int calcTimeBonus(double timeSeconds) {
        if (timeSeconds <= 0) {
            return 30;
        }
        int bonus = (int) Math.round(30.0 - (timeSeconds / 2.0));
        return Math.max(0, Math.min(30, bonus));
    }

    /**
     * メイン: コマンドライン引数で座標と経過時間を受け取り、
     * JSON 形式でスコアを出力する
     */
    public static void main(String[] args) {
        if (args.length < 5) {
            System.err.println("Usage: java ScoreCalculator <guessLat> <guessLng> <ansLat> <ansLng> <timeSeconds>");
            System.err.println("Example: java ScoreCalculator 34.0 133.0 34.46 133.99 15.2");
            System.exit(1);
        }

        try {
            double guessLat    = Double.parseDouble(args[0]);
            double guessLng    = Double.parseDouble(args[1]);
            double ansLat      = Double.parseDouble(args[2]);
            double ansLng      = Double.parseDouble(args[3]);
            double timeSeconds = Double.parseDouble(args[4]);

            // 計算
            double distanceKm    = haversine(guessLat, guessLng, ansLat, ansLng);
            int    distanceScore = calcDistanceScore(distanceKm);
            int    timeBonus     = calcTimeBonus(timeSeconds);
            int    totalScore    = distanceScore + timeBonus;

            // JSON 出力
            System.out.printf(
                "{\"distance_km\":%.1f,\"distance_score\":%d,\"time_seconds\":%.1f,\"time_bonus\":%d,\"total_score\":%d}%n",
                distanceKm, distanceScore, timeSeconds, timeBonus, totalScore
            );

        } catch (NumberFormatException e) {
            System.err.println("Error: Invalid number format — " + e.getMessage());
            System.exit(1);
        }
    }
}
