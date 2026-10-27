# 単語帳：基本形3,000語

## 今回のルール

- 3〜6文字の英字だけを正解用単語帳に登録。ネット接続せずに判定します。
- CAT、DOG などの初歩的な単語から、ACCEPT、AFFORD、EFFECT、EFFORT、DECIDE、NOTICE などの学習語まで含めます。
- 複数形、三人称単数、過去形、過去分詞、進行形、比較級・最上級を追加しません。例：CATS、WOMEN、WENT、EATEN、PLAYED、BETTER は不正解。
- 語尾だけで判断しません。GLASS、GRASS、SPRING は基本形として登録します。ROSE は「バラ」という名詞として登録し、RISE の過去形として登録したものではありません。READ のように基本形と過去形が同じ綴りのものは、基本形として正解です。
- 固有名詞・略語は採用を抑え、一般語を中心に選定しています。
- 正解の判定はこの確定ファイルへの完全一致で行います。プレイ中の自動取得・語形変換は行いません。

## ファイル

- `vocabulary.js`：生成した3,000語の正解リスト。日本語訳は含めません。
- `words.js`：既存の日本語訳付き基本語。正解リストに統合し、4文字以下を `WordPopEasyWords` として別に保持します。やさしい盤面・ヒントの調整に使うための区分です。現在はこのやさしい語群を、残り単語の確認・一直線の自動連鎖に使っています（[GAMEPLAY.md](GAMEPLAY.md)）。
- `data/vocabulary-exclusions.json`：変化形や今回採用しない語の明示的な除外一覧。
- `data/vocabulary-report.json`：語数・文字数内訳・元データのハッシュ。
- `scripts/build-vocabulary.py`：再生成用スクリプト。

日本語訳のない語も正解として認めます。現在は381語の日本語訳を意味表示に使い、未整備語には準備中と表示します。残りの訳は今後別途整備します。

## 選び方と限界

WordNet 3.0 の小文字の見出し語を候補にし、wordfreq 3.1.1 の英語使用頻度（Zipf 3.5以上）で絞りました。WordNetの不規則変化一覧と規則変化の候補照合で変化形を除外し、既存の意味確認済み基本語と機能語を補っています。頻度順で計3,000語に固定しています。接尾辞の形だけで誤って消える SEED、KING 等は、意味確認済みの基本語として保持しています。

これは高校入試の公式出題リストやCEFR認定リストではありません。頻度は難易度と同じではなく、入試語彙の網羅性も保証しません。一般的な学習語を広く採用するための初回データ整備です。辞書内の専門語・多義語や語形の判別には限界があるため、今後のプレイテストと教育用語彙との照合で除外・追加を続けます。7文字以上の入試単語は、今のゲームルールでは対象外です。

## 再生成

ゲームの実行には Python や追加パッケージは不要です。以下は単語帳を更新する開発者向けです。

1. Python の独立した作業環境に `wordfreq==3.1.1` をインストールします。
2. WordNet 3.0 のアーカイブを取得します。今回使用した配布先：
   <https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet.zip>
3. `data/vocabulary-report.json` の SHA-256 と照合し、リポジトリのルートで実行します。

```sh
python3 scripts/build-vocabulary.py /path/to/wordnet.zip
node --test tests/*.test.cjs
```

生成物をレビューしてから保存します。手作業の追加では `words.js` の意味付き基本語を使い、除外すべき語は `data/vocabulary-exclusions.json` に理由を記入します。生成した `vocabulary.js` を直接編集すると再生成時に失われます。

## 出典・利用条件

この追加語彙データは **CC BY-SA 4.0** として提供します。改変：3〜6文字への限定、頻度選定、語形・固有名詞等の除外、既存基本語との統合。プログラム全体をこのライセンスに変更するものではありません。

- **Princeton WordNet 3.0**, Copyright 2006 Princeton University。元ライセンス全文：[licenses/WORDNET.txt](../licenses/WORDNET.txt)。辞書利用・複製・改変・再配布を許可する条件と免責事項を保持しています。
- **wordfreq 3.1.1**, Robyn Speer：<https://github.com/rspeer/wordfreq>。コードは Apache-2.0、同梱頻度データは CC BY-SA 4.0。今回は語の選定に頻度データを利用しました。<https://creativecommons.org/licenses/by-sa/4.0/>
- データの出典を含む配布元の通知・引用情報を [licenses/wordfreq-NOTICE.txt](../licenses/wordfreq-NOTICE.txt) に保存しています。Google Books Ngrams、Leeds Internet Corpus、Wikipedia、ParaCrawl、OPUS OpenSubtitles 2018 / OpenSubtitles、SUBTLEX の著者 Marc Brysbaert ほかに帰属します。SUBTLEX は自由に利用できるデータです。詳細と原典URLは同通知を参照してください。

## 今回のブラウザ検証の範囲

HTTP配信でゲーム操作と3,000語の読み込みを検証しました。クラウドのブラウザポリシーが `file://` を拒否したため、ファイルを直接開く検証はスキップしています。追加語彙は外部通信や fetch を使わない通常のスクリプトで読み込みます。
