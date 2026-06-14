#!/usr/bin/env ruby
# frozen_string_literal: true

# ============================================================
# 島ガチャ — 島データ収集スクリプト
# Wikipedia API から西日本離島の情報を一括取得し JSON に出力する
# 使い方: ruby scripts/collect_islands.rb
# 出力:   data/islands.json
# ============================================================

require 'net/http'
require 'json'
require 'uri'

# ---------- 対象の島リスト ----------
# wiki_title は日本語Wikipedia の記事タイトルをそのまま指定
# difficulty: easy=有名, normal=やや知名度あり, hard=マイナー

ISLANDS = [
  # ===== 瀬戸内海エリア =====
  { wiki_title: '直島町',           prefecture: '香川県',   region: '瀬戸内海', difficulty: 'easy'   },
  { wiki_title: '小豆島',           prefecture: '香川県',   region: '瀬戸内海', difficulty: 'easy'   },
  { wiki_title: '豊島_(香川県)',     prefecture: '香川県',   region: '瀬戸内海', difficulty: 'normal' },
  { wiki_title: '犬島',             prefecture: '岡山県',   region: '瀬戸内海', difficulty: 'hard'   },
  { wiki_title: '大三島',           prefecture: '愛媛県',   region: '瀬戸内海', difficulty: 'normal' },
  { wiki_title: '因島',             prefecture: '広島県',   region: '瀬戸内海', difficulty: 'normal' },
  { wiki_title: '厳島',             prefecture: '広島県',   region: '瀬戸内海', difficulty: 'easy'   },
  { wiki_title: '大崎上島',         prefecture: '広島県',   region: '瀬戸内海', difficulty: 'hard'   },
  { wiki_title: '淡路島',           prefecture: '兵庫県',   region: '瀬戸内海', difficulty: 'easy'   },
  { wiki_title: '家島諸島',         prefecture: '兵庫県',   region: '瀬戸内海', difficulty: 'hard'   },
  { wiki_title: '男木島',           prefecture: '香川県',   region: '瀬戸内海', difficulty: 'hard'   },
  { wiki_title: '女木島',           prefecture: '香川県',   region: '瀬戸内海', difficulty: 'hard'   },
  { wiki_title: '生口島',           prefecture: '広島県',   region: '瀬戸内海', difficulty: 'normal' },
  { wiki_title: '伯方島',           prefecture: '愛媛県',   region: '瀬戸内海', difficulty: 'normal' },
  { wiki_title: '周防大島町',       prefecture: '山口県',   region: '瀬戸内海', difficulty: 'normal' },

  # ===== 九州エリア =====
  { wiki_title: '対馬',             prefecture: '長崎県',   region: '九州',     difficulty: 'normal' },
  { wiki_title: '壱岐島',           prefecture: '長崎県',   region: '九州',     difficulty: 'normal' },
  { wiki_title: '五島列島',         prefecture: '長崎県',   region: '九州',     difficulty: 'normal' },
  { wiki_title: '端島_(長崎県)',     prefecture: '長崎県',   region: '九州',     difficulty: 'easy'   },
  { wiki_title: '屋久島',           prefecture: '鹿児島県', region: '九州',     difficulty: 'easy'   },
  { wiki_title: '種子島',           prefecture: '鹿児島県', region: '九州',     difficulty: 'easy'   },
  { wiki_title: '奄美大島',         prefecture: '鹿児島県', region: '九州',     difficulty: 'easy'   },
  { wiki_title: '与論島',           prefecture: '鹿児島県', region: '九州',     difficulty: 'normal' },
  { wiki_title: '甑島列島',         prefecture: '鹿児島県', region: '九州',     difficulty: 'hard'   },
  { wiki_title: '天草諸島',         prefecture: '熊本県',   region: '九州',     difficulty: 'normal' },
  { wiki_title: '能古島',           prefecture: '福岡県',   region: '九州',     difficulty: 'hard'   },
  { wiki_title: '姫島_(大分県)',     prefecture: '大分県',   region: '九州',     difficulty: 'hard'   },
  { wiki_title: '喜界島',           prefecture: '鹿児島県', region: '九州',     difficulty: 'hard'   },
  { wiki_title: '徳之島',           prefecture: '鹿児島県', region: '九州',     difficulty: 'normal' },

  # ===== 沖縄エリア =====
  { wiki_title: '石垣島',           prefecture: '沖縄県',   region: '沖縄',     difficulty: 'easy'   },
  { wiki_title: '宮古島',           prefecture: '沖縄県',   region: '沖縄',     difficulty: 'easy'   },
  { wiki_title: '西表島',           prefecture: '沖縄県',   region: '沖縄',     difficulty: 'easy'   },
  { wiki_title: '竹富島',           prefecture: '沖縄県',   region: '沖縄',     difficulty: 'normal' },
  { wiki_title: '波照間島',         prefecture: '沖縄県',   region: '沖縄',     difficulty: 'normal' },
  { wiki_title: '久米島',           prefecture: '沖縄県',   region: '沖縄',     difficulty: 'normal' },
  { wiki_title: '渡嘉敷島',         prefecture: '沖縄県',   region: '沖縄',     difficulty: 'hard'   },
  { wiki_title: '座間味島',         prefecture: '沖縄県',   region: '沖縄',     difficulty: 'hard'   },
  { wiki_title: '伊江島',           prefecture: '沖縄県',   region: '沖縄',     difficulty: 'hard'   },
  { wiki_title: '与那国島',         prefecture: '沖縄県',   region: '沖縄',     difficulty: 'normal' },
  { wiki_title: '多良間島',         prefecture: '沖縄県',   region: '沖縄',     difficulty: 'hard'   },
]

# ---------- Wikipedia API ヘルパー ----------

def wiki_get(path)
  uri = URI("https://ja.wikipedia.org#{path}")
  res = Net::HTTP.get_response(uri)
  JSON.parse(res.body)
rescue => e
  puts "  [WARN] API error: #{e.message}"
  nil
end

def fetch_summary(title)
  wiki_get("/api/rest_v1/page/summary/#{URI.encode_www_form_component(title)}")
end

def fetch_coordinates(title)
  data = wiki_get("/w/api.php?action=query&titles=#{URI.encode_www_form_component(title)}&prop=coordinates&format=json")
  return nil unless data
  page = data.dig('query', 'pages')&.values&.first
  coords = page&.dig('coordinates')&.first
  coords ? { lat: coords['lat'], lng: coords['lon'] } : nil
end

def fetch_image_urls(title, max_images = 5)
  # Step 1: 記事に含まれる画像ファイル一覧
  data = wiki_get(
    "/w/api.php?action=query&titles=#{URI.encode_www_form_component(title)}" \
    "&prop=images&imlimit=20&format=json"
  )
  return [] unless data

  page = data.dig('query', 'pages')&.values&.first
  images = page&.dig('images') || []

  # 写真だけ抽出（SVG, アイコン, 旗, ロゴを除外）
  photo_files = images
    .map { |i| i['title'] }
    .select { |t| t.match?(/\.(jpg|jpeg|png)$/i) }
    .reject { |t| t.match?(/Icon|Flag|Logo|Emblem|Map|map|位置|Commons|Wikt/i) }

  # Step 2: 各画像の実 URL を取得
  urls = []
  photo_files.first(max_images).each do |file|
    info = wiki_get(
      "/w/api.php?action=query&titles=#{URI.encode_www_form_component(file)}" \
      "&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json"
    )
    next unless info
    thumb = info.dig('query', 'pages')&.values&.first&.dig('imageinfo', 0, 'thumburl')
    urls << thumb if thumb
    sleep 0.5
  end

  urls
end

# ヒントを概要文から抽出（最大3文）
def extract_hints(text)
  return ['情報なし'] unless text && !text.empty?
  sentences = text.split(/[。．]/).map(&:strip).reject(&:empty?)
  sentences.first(3).map { |s| "#{s}。" }
end

# ---------- メイン処理 ----------

puts "=" * 50
puts "島ガチャ — データ収集開始"
puts "対象: #{ISLANDS.size} 島"
puts "=" * 50

results = []

ISLANDS.each_with_index do |island, i|
  title = island[:wiki_title]
  puts "\n[#{i + 1}/#{ISLANDS.size}] #{title}"

  # 概要を取得
  summary = fetch_summary(title)
  unless summary
    puts "  [SKIP] 概要取得失敗"
    next
  end
  sleep 0.5

  # 座標を取得
  coords = fetch_coordinates(title)
  unless coords
    puts "  [SKIP] 座標なし"
    next
  end
  sleep 0.5

  # 画像を取得
  puts "  画像取得中..."
  image_urls = fetch_image_urls(title)
  puts "  → #{image_urls.size} 枚取得"
  sleep 0.5

  # 島名を整形（括弧除去）
  name = (summary['title'] || title).gsub(/[（\(].+?[）\)]/, '').strip

  # ヒントを抽出
  hints = extract_hints(summary['extract'])

  results << {
    name:           name,
    prefecture:     island[:prefecture],
    region:         island[:region],
    lat:            coords[:lat],
    lng:            coords[:lng],
    population:     nil,  # Wikipedia から自動取得が難しいため手動追加推奨
    hints:          hints,
    wiki_title:     title,
    difficulty:     island[:difficulty],
    image_urls:     image_urls,
    has_streetview: false
  }

  puts "  ✓ #{name}（#{island[:prefecture]}）"
end

# ---------- JSON 出力 ----------

output_path = File.join(__dir__, '..', 'data', 'islands.json')
File.write(output_path, JSON.pretty_generate(results))

puts "\n" + "=" * 50
puts "完了！ #{results.size} / #{ISLANDS.size} 島のデータを保存しました"
puts "出力先: #{output_path}"
puts "=" * 50
