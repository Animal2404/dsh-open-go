# 鈿?dsh-opencode-quota

OpenCode GO 濂楅棰濆害 + 瀹樻柟璐﹀崟灏忕粍浠讹紝鎸傚湪 DSH Web 渚ц竟鏍?*璁剧疆鎸夐挳涓婃柟**锛坄sidebar.footer.action` 鎻掓Ы锛夈€?
## 鍔熻兘

**Open GO 棰濆害**锛堝畼鏂?usage 鎺ュ彛锛?- 婊氬姩 / 姣忓懆 / 姣忔湀涓夋。棰濆害鐧惧垎姣旀潯 + 閲嶇疆鏃堕棿
- 鏍囬鏃佹樉绀?24 鏃跺埗鏇存柊鏃堕棿锛堝 `17:35 鏇存柊`锛?- 鐐瑰嚮 鈫?绔嬪嵆鍒锋柊锛屾瘡 5 鍒嗛挓鑷姩杞

**瀹樻柟璐﹀崟**锛坥pencode 鎺у埗鍙?getCosts RPC锛岄潪鏈湴浼扮畻锛?- **浠婃棩**锛氳摑鑹插潡锛屾寜妯″瀷鏌辩姸鏉★紙妯″瀷鍚?+ 鍗犳瘮% + 閲戦锛?- **鏈湀**锛氱豢鑹插潡锛屾寜妯″瀷鏌辩姸鏉★紙top 4锛?- 閲戦鏉ヨ嚜瀹樻柟鎺у埗鍙帮紝绮剧‘鍒板垎

**绐勪晶鏍?*锛坮ail 妯″紡锛夎嚜鍔ㄩ€€鍖栦负灏忓浘鏍囨寜閽€?
## 瀹夎

```sh
dsh plugin --profile web add https://github.com/Animal2404/dsh-opencode-quota
# 閲嶅惎 dsh web 鐢熸晥
```

## 閰嶇疆鍑瘉锛垀/.dsh/.credentials.yaml锛?
棰濆害鍔熻兘**闆堕厤缃?*锛氳嚜鍔ㄥ鐢ㄥ凡鏈夌殑 `OPENCODE_GO_API_KEY`銆?
瀹樻柟璐﹀崟闇€瑕佷袱姝ワ紙涓€娆℃€э紝绾?2 鍒嗛挓锛夛細

```yaml
# 鈶?workspace id锛氭墦寮€ https://opencode.ai/workspace/ 鐢ㄩ噺椤碉紝
#    鍦板潃鏍忛噷 wrk_ 寮€澶寸殑閭ｆ灏辨槸
OPENCODE_WORKSPACE_ID: 'wrk_01KZZVJ4HX6PR54FNAZJWXFWHX'

# 鈶?鐧诲綍 cookie锛堢櫥褰?opencode.ai 鍚庯紝浠婚€変竴绉嶆柟寮忚幏鍙栵級锛?OPENCODE_CONSOLE_COOKIE: 'auth=Fe26.2**...; oc_locale=zh'
```

### 鑾峰彇 cookie 鐨?3 绉嶆柟寮忥紙閮戒笉闇€瑕佹姄鍖?鎴浘锛?
**鏂瑰紡 A锛堟渶绠€鍗曪紝鎺у埗鍙颁竴琛屽懡浠わ級**
1. 娴忚鍣ㄧ櫥褰?https://opencode.ai/workspace/ 鐢ㄩ噺椤碉紝鎸?F12 鈫?Console
2. 杈撳叆 `allow pasting` 鍥炶溅锛圕hrome 棣栨绮樿创鐨勫畨鍏ㄦ彁绀猴級
3. 绮樿创 `copy(document.cookie)` 鍥炶溅 鈥斺€?鑷姩澶嶅埗鍒板壀璐存澘
4. 绮樿创鍒板嚟璇佹枃浠跺嵆鍙?
**鏂瑰紡 B锛圕ookie-Editor 鎻掍欢锛?*
1. 娴忚鍣ㄨ Cookie-Editor 鎻掍欢锛岀櫥褰?opencode.ai 鍚庢墦寮€鎻掍欢
2. 鐐?Copy锛堝鍒跺叏閮?cookie锛屾牸寮忓嵆 `auth=...; oc_locale=zh`锛?3. 绮樿创鍒板嚟璇佹枃浠?
**鏂瑰紡 C锛團12 Application 闈㈡澘锛?*
1. F12 鈫?Application 鈫?Cookies 鈫?opencode.ai
2. 鎵惧埌 `auth`锛屽弻鍑?Value 鍏ㄩ€夊鍒?3. 鎷兼垚 `auth=<澶嶅埗鐨勫€?` 鍐欏叆鍑瘉鏂囦欢

> cookie 鏄櫥褰曚細璇濓紝**杩囨湡鍚庨噸鏂板鍒朵竴娆″嵆鍙?*锛堣处鍗曚細鏄剧ず"cookie 鍙兘宸茶繃鏈?鎻愮ず锛夈€?
## 鎵嬪姩楠岃瘉瀹夸富鎺ュ彛

```powershell
# 棰濆害
Invoke-RestMethod -Uri http://127.0.0.1:3080/dsh-opencode-quota/api/status -Headers @{ 'x-dsh-opencode-quota' = '1' }
# 瀹樻柟璐﹀崟锛堟湰鏈堟寜鏃ッ楁ā鍨嬶級
Invoke-RestMethod -Uri http://127.0.0.1:3080/dsh-opencode-quota/api/official -Headers @{ 'x-dsh-opencode-quota' = '1' }
```

## 鐩綍缁撴瀯

```
lib/index.js    # 瀹夸富锛氶搴?/ 璐﹀崟 RPC / 璇诲嚟璇佸簱锛宬ey/cookie 涓嶅嚭鏈嶅姟鍣?lib/client.js   # 娴忚鍣ㄧ缁勪欢锛坰idebar.footer.action 鎻掓Ы锛?bin/            # modlens 鍖呰鍣紙鍙€夛紝璇嗗浘鐢ㄩ噺鏈湴璁板綍锛?cordis.patch.yml
```

## 璇存槑

- 瀹樻柟璐﹀崟璧?opencode 鎺у埗鍙扮殑鐧诲綍浼氳瘽璁よ瘉锛堝畼鏂归檺鍒讹紝API key 鏃犳硶璁块棶锛夛紝鎵€浠ュ繀椤婚厤缃?cookie锛涢搴︽帴鍙ｇ敤 API key锛屾棤闇€ cookie
- 鎵€鏈夊嚟鎹彧鍦ㄥ涓讳晶浣跨敤锛岀粷涓嶄笅鍙戞祻瑙堝櫒
- 鏃堕棿鏄剧ず涓烘湰鍦版椂鍖?24 鏃跺埗锛涜处鍗曟寜 +08:00 鏃跺尯鑱氬悎锛堜笌鎺у埗鍙伴〉闈竴鑷达級
