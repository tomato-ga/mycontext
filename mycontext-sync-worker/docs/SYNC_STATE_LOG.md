# Sync state log contract

## Goal

Notion同期の各実行について、入力、検証ルール、状態遷移、結果、失敗理由、次の操作を、次の実行から参照できる永続的なトレースとして残す。

## Storage contract

`context_sync_state_log`は追記専用テーブルである。1回のQueue deliveryを`run_id`で束ね、`sequence_no`順に状態を復元する。Workerは既存行を更新・削除せず、同じ`run_id + sequence_no`の再送だけを冪等に無視する。

本文、Notion token、TiDB URLなどの秘密情報は保存しない。入力はSHA-256、ルールはparser/sectioning/routing version、結果はcandidate revisionと件数で記録する。エラーメッセージは復旧に必要な範囲だけ保存する。

## State contract

| State | Meaning | Required evidence |
| --- | --- | --- |
| `received` | Queue deliveryを受け取った | event ID、attempt、page ID |
| `eligible` | Notion管理プロパティを検証した | document ID、category、元Status |
| `syncing` | Notionを`Syncing`にした、または再試行を再開した | workflow status |
| `source_verified` | 2回取得した本文と管理情報が一致した | input fingerprint、Markdown hash |
| `content_validated` | 文書種別の構造検証を通過した | parser version、candidate revision、件数 |
| `persisted` | TiDB read modelへの書き込みを完了した | result status、candidate revision |
| `synced` / `skipped` | 正常終了した | 最終revision、次の操作なし |
| `ignored` | 同期対象外として終了した | 理由 |
| `failed` | 人間の修正が必要な状態で終了した | error code、message、次の操作 |
| `retryable_failure` | 自動再試行へ戻した | error code、attempt、retryable=true |
| `dead_lettered` | 自動再試行を使い切った | error code、次の操作=`human_review_required` |

## Regression rule

本番の`failed`または`dead_lettered`を修正するときは、失敗した入力構造をfixtureまたは最小再現Markdownへ落とし、修正前に失敗する回帰テストを追加する。解析結果を変える修正ではparser versionを更新する。テスト、型検査、実同期の状態ログ確認がそろうまで完了にしない。

今回の`expected H3 delivery sections under 22`は、21章に長文契約、22章に参照データを置く再現Markdownとして`mycontext-sync/tests/authorStyle.test.ts`へ固定している。発生時の状態と本番検証結果は[`incidents/2026-07-22-author-style-chapter-map.md`](incidents/2026-07-22-author-style-chapter-map.md)に保存する。

## Operational queries

直近の実行:

```sql
SELECT run_id, sequence_no, document_id, state, error_code,
       parser_version, candidate_revision_sha256, recorded_at
FROM context_sync_state_log
WHERE run_id IN (
  SELECT DISTINCT run_id
  FROM context_sync_state_log
  WHERE document_id = 'ore-body-style'
)
ORDER BY recorded_at DESC, sequence_no DESC
LIMIT 50;
```

再発した失敗:

```sql
SELECT error_code, parser_version, COUNT(*) AS occurrences,
       MIN(recorded_at) AS first_seen, MAX(recorded_at) AS last_seen
FROM context_sync_state_log
WHERE state IN ('failed', 'dead_lettered')
GROUP BY error_code, parser_version
ORDER BY last_seen DESC;
```
