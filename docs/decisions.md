# Döntések

Tartós döntésenként egy bejegyzés, a legújabb elöl. Változó döntést helyben szerkesztünk (a változás dátumával), nem duplikálunk. A korábbi döntések háttere a `README.md`-ben van (biztonsági modell, séma).

## 2026-11-06 · Statisztika hónapokra bontva, fánk nélkül
- **Döntés:** a Statistics két szintű: áttekintő (12 havi oszlopok, hónaplista) és hónapnézet (bevétel/kiadás csempe mint választó, 12 havi átlag, hónap végi egyenleg, lebontás kategória vagy zseb szerint rangsorolt sávokkal). Fánkdiagram és automatikus „észrevételek” nincsenek. A lebontási sor lefúrása pontosan azokat a tételeket listázza, amelyekből az összeg áll (a History `drill` paramétere, Jar-összevonás nélkül). Az eszköz- és zsebkör-választás a két képernyőn közös, de csak memóriában él. Hónap = naptári hónap, egyszerre egy eszköz (nincs átváltás).
- **Miért:** a fánk negatív összeget nem tud ábrázolni, és sok kategóriánál olvashatatlan; a cél az átláthatóság, egy képernyő egy kérdésre feleljen. Gyula döntése (B változat, átlaghoz viszonyítás, hónap végi egyenleg benne, észrevételek nélkül).
- **Érinti:** `src/screens/StatisticsScreen.tsx`, `src/screens/StatisticsMonthScreen.tsx`, `src/domain/monthlyStats.ts`, `src/db/repositories/monthlyStats.ts`, `src/domain/transactionFilter.ts` (`TransactionDrill`), `DESIGN.md` (Charts). Spec: `docs/specs/2026-11-06-statistics-months.md`.

## 2026-11-06 · A repó-réteg SQL-jét valódi SQLite-on teszteljük
- **Döntés:** a `src/db/repositories/*` tesztjei a Node beépített `node:sqlite` moduljával egy memóriabeli adatbázison futnak (`tests/stubs/dbClient.ts`, `tests/ledgerFixture.ts`; a `tests/resolve-ts.mjs` cseréli a `../client` importot). Pénzt számoló új lekérdezéshez ilyen teszt jár, nem csak a tiszta logikához.
- **Miért:** a tiszta logika tesztjei nem fogták meg, hogy az „Outside Jar” kezdőegyenleg SQL-je rossz (B24); az első valódi SQLite-os összevetés megtalálta. Új függőség nem kell. Helyben Node 22 fut; a CI (Node 20) csak típusellenőriz, a teszteket nem futtatja.
- **Érinti:** `tests/`, `scripts/check.sh` (a `npm test` része).

## 2026-10-27 · Összegbevitel: a vessző és a pont is tizedesjel
- **Döntés:** az összegmezőben a `,` és a `.` egyaránt a tizedeseket jelöli; számjegyet csoportosítani csak szóközzel lehet; két elválasztó („1,000.50”) hiba, nem találgatunk.
- **Miért:** a régi parser minden vesszőt eldobott, így a magyar „12,5” 125 lett (B7). Gyula döntése.
- **Érinti:** `src/utils/amountMinor.ts`, `src/screens/JarAdvancedAssetEditor.tsx`

## 2026-10-27 · A kiírt összegek kerekítenek; eszközönként felülírható
- **Döntés:** listák és összesítők kerekítve mutatják az összeget. Automatikusan: 100 egységtől nincs tizedes, 1 és 100 között 2, 1 alatt 3 értékes jegy. Eszközönként fix 0–8 tizedes állítható (Asset types → Edit; `asset_types.display_decimals`, migráció 0008, NULL = auto). A tárolt érték és a szerkesztőmezők pontosak maradnak.
- **Miért:** a 8 tizedes nagy összegeknél fölösleges (333.33333333 HUF); csak méret alapján viszont a kriptó (1.23456789 BTC) veszítene. Gyula választása az „auto + eszközönként” változat.
- **Érinti:** `src/utils/formatMinor.ts` (memóriabeli tábla, a `listAssetTypes` tölti), `src/screens/AssetTypesScreen.tsx`

## 2026-10-27 · Egységtesztek a Node beépített futtatójával
- **Döntés:** `npm test` = `node --test` a `tests/*.test.ts`-re, függőség nélkül (a Node 24 maga kezeli a típusokat). A `tests/resolve-ts.mjs` a kiterjesztés nélküli importokat `.ts`-re oldja, a natív Expo modulokat (`expo-crypto`) a `tests/stubs/` helyettesíti. A `check.sh` futtatja.
- **Miért:** a tesztfuttató eddig új függőség lett volna; így nem kell.
- **Érinti:** `package.json`, `scripts/check.sh`, `tests/`

## 2026-10-27 · `.tarcak` mentés: v2 külső formátum
- **Döntés:** az új mentések fejlécében benne van a PBKDF2-iterációszám, és a fejléc GCM AAD-ként hitelesített; a v1 fájlok (mindig 100 000 iteráció) továbbra is nyithatók. A régi appverzió a v2-t nem nyitja meg („Update the app”).
- **Miért:** az iterációszám emelése különben minden régi mentést nyithatatlanná tett volna (B6). Gyula kérte a hibák javítását.
- **Érinti:** `src/security/backupCrypto.ts`

## 2026-10-27 · Jar-elosztás: csak pontosan 100%, archivált zseb nem lehet cél
- **Döntés:** az Advanced Jar csak 100%-os splitet ment (a „Save anyway” részleges mentés megszűnt); archivált zseb nem lehet split-cél (archiválás elutasítva, elosztás megáll).
- **Miért:** a részleges split mentése mindig elbukott a repóban és az elosztásban (B13); archivált célba rejtett zsebbe ment volna a pénz (B14).
- **Érinti:** `src/domain/jarAdvancedEditorSave.ts`, `src/db/repositories/pockets.ts`, `src/db/repositories/jar.ts`

## 2026-10-27 · Android: nincs automatikus rendszermentés
- **Döntés:** `app.json` → `android.allowBackup: false`; a támogatott mentés a titkosított `.tarcak` export.
- **Miért:** a Google-mentés a DB-t a SecureStore-kulcsok nélkül vitte volna át, új készüléken nyithatatlan fájl maradt volna (B16).
- **Érinti:** `app.json` (új buildtől él)

## 2026-10-27 · A típusellenőrzés a teljes projektre fut
- **Döntés:** a CI és a `scripts/check.sh` a `npm run typecheck`-et (`tsc --noEmit`, a gyökér `tsconfig.json`) futtatja; a `typecheck:src` megmarad, de csak a `.ts` fájlokat fedi.
- **Miért:** a `tsconfig.src.json` `include`-ja `src/**/*.ts`, így egyetlen `.tsx` (képernyők, komponensek, `AppBoot.tsx`) sem volt ellenőrizve. A teljes futás zöld, de csak azért, mert 26 `.tsx` fájl `// @ts-nocheck`-kel kikapcsolja magát (`docs/bugs.md` B3); az új fájlok és a maradék kettő viszont már ellenőrzöttek.
- **Érinti:** `package.json`, `.github/workflows/ci.yml`, `scripts/check.sh`

## 2026-10-27 · Az EAS production build és submit nincs tiltva a guardban
- **Döntés:** a `.claude/guard.json` csak a `main`-re pusholást tiltja; az EAS parancsokra a `CLAUDE.md` szabálya vonatkozik (csak külön engedéllyel).
- **Miért:** Gyula kérése.
- **Érinti:** `.claude/guard.json`, `CLAUDE.md`

## 2026-10-28 · Expo SDK 55 és a `zod` felülírása
- **Döntés:** Expo SDK 54 → 55 (React Native 0.83, React 19.2); a `package.json` `overrides` a `zod`-ot `^4.6.7`-re emeli; új függőség: `expo-system-ui`; az `app.json`-ból kikerült az `android.edgeToEdgeEnabled` (az SDK 55-ben mindig be van kapcsolva).
- **Miért:** B12. Az `npm audit fix` 31-ből 12 találatot hagyott, az SDK 55 9-re vitte le. Az SDK 56–58 sem old meg többet. Az utolsó magas találat a `zod` 3.x az `@expo/cli`-ben (build-eszköz, nem kerül az appba), amihez nincs javított 3.x kiadás; a zod 4-gyel az `expo config` és az `expo prebuild` lefut. Az `expo-system-ui` a `userInterfaceStyle: light` beállításhoz kell. Gyula engedélyezte.
- **Érinti:** `package.json`, `app.json`, `README.md`; ha az Expo felhoz zod 4-et, az override törölhető.

## 2026-10-28 · Képernyőkép-tiltás kapcsolható beállításként
- **Döntés:** új függőség `expo-screen-capture` (~55.0.18); Beállítások → Privacy → „Block screenshots” (`user_settings.block_screen_capture`, alapból ki). Bekapcsolva Androidon `FLAG_SECURE`: nincs képernyőkép és felvétel, az appváltóban nincs előnézet. Az érték az adatbázisban van, ezért az app a feloldás után alkalmazza; zárolt állapotban nincs rajta adat.
- **Miért:** B10. Az appváltó-előnézetre a háttérbe lépéskori azonnali zárolás nem garancia, a `FLAG_SECURE` az; de a képernyőkép-készítést megakadályozza, ezért nem alapértelmezett. A könyvtár két fölösleges jogosultságot hoz (`READ_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, csak a régi Androidok képernyőkép-figyelőjéhez kellenek), ezek az `app.json` `blockedPermissions` listájában vannak. Gyula kérte.
- **Változás (2026-11-04):** a `DETECT_SCREEN_CAPTURE` nem tiltható: Android 14+-on a könyvtár induláskor feltétel nélkül regisztrálja a képernyőkép-callbacket, és a jogosultság nélkül az app a betöltéskor összeomlik (B23). Normál, telepítéskor megadott jogosultság, adathoz nem ad hozzáférést. A `tests/appConfig.test.ts` őrzi.
- **Érinti:** `package.json`, `app.json`, `src/utils/screenCapture.ts`, `src/db/repositories/settings.ts`, `src/screens/SettingsScreen.tsx`, `AppBoot.tsx`

## 2026-10-28 · Havi kimutatás exportja: sima CSV, kevés adat, kimondott titkosítatlanság
- **Döntés:** Statisztika → „Export report…”: havi bevétel/kiadás/nettó CSV (pénznemenként, soha nem összeadva), opcionális kategóriabontással (alapból ki). A fájl nincs titkosítva, ezt egy megerősítő felugró mondja ki a megosztás előtt. Nincs vágólapra másolás, nincs titkosított változat, nincs új függőség és migráció, a `src/security/` és a `.tarcak` formátum érintetlen.
- **Miért:** Gyula táblázatkezelőben akar diagramozni. A fájl alapból nem hordoz zsebnevet, tranzakciócímet, pontos dátumot vagy azonosítót; a kategórianevek (szabad szöveg) és a pénznemek köre csak tudatos kapcsolóval/jelöléssel kerül bele. Vágólap: Androidon a vágólap-előzmény és -szinkron szivároghat, az `expo-clipboard` nem jelöli a tartalmat érzékenynek. A jelentésfájl a cache-ben marad a következő exportig vagy képernyő-megnyitásig (a fogadó app aszinkron olvashat), ezért nincs azonnali törlés.
- **Érinti:** `src/domain/monthlyReport.ts`, `src/db/repositories/report.ts`, `src/db/repositories/statistics.ts` (`scopeSql` kiemelve), `src/utils/reportFile.ts`, `src/screens/ReportExportScreen.tsx`, `README.md`; a spec: `docs/specs/2026-10-28-monthly-report-export.md`

## 2026-10-28 · A havi export alapértelmezett CSV-előbeállítása: International
- **Döntés:** az export képernyő alapból az International előbeállítást kínálja (`,` elválasztó, `.` tizedesjel); a Hungarian (`;` és `,`) választható marad. Az érték továbbra sem tárolódik.
- **Miért:** eszközön a `0,14163066` kiírt érték angol nyelvű táblázatkezelőben `14,163,066` lett (a vesszőt ezres tagolónak olvasta), vagyis az 1-nél kisebb összegeknél az eredmény 100 millió-szorosan hamis volt. A kiírt szöveg helyes; a pont ilyen téves olvasatot nem enged. Gyula kérése.
- **Érinti:** `src/screens/ReportExportScreen.tsx`, `README.md`, a spec

## 2026-10-28 · Egy diagrampaletta, témafüggő kategóriaszín, stíluskapu
- **Döntés:** egyetlen diagrampaletta (`src/utils/pocketChartColors.ts`: a téma kiemelőszíne + 7 fix árnyalat, világos és sötét változatban), amit a Statisztika, a Jar-diagram, a Jar-felosztássáv, a History és a Kategóriák is használ. Egy diagramban a zsebek/kategóriák ütközés nélkül kapnak színt (`assignChartColors`). A kategória színe továbbra is hex-ként tárolódik, de megjelenítéskor a mostani téma azonos helyű színére képződik le (`resolveStoredColor`), a régi paletta színei is. Nincs migráció és nincs formátumváltozás (a `.tarcak` mentés érintetlen). Új `scripts/style-scan.mjs` (a `check.sh` futtatja): nyers hex, színliterál, betűcsalád-literál, 12 alatti betű, `LayoutAnimation` és számszerű `hitSlop` tilos. A `LayoutAnimation` csak az `animateNextLayout()`-on át megy, ami tiszteli a „Reduce motion”-t. A tortadiagramok közös komponense: `DonutChart` (legenda: név, százalék, összeg).
- **Miért:** a Statisztika fix 7 színe sötét témán 1,9–3,6:1 volt a felületen (WCAG 1.4.11: 3:1), a kategóriák világos témán választott színei sötéten eltűntek, a Jar és a Statisztika ugyanazt a zsebet más színnel rajzolta, és a hash-színezés két zsebet azonos színre tehetett. A migráció nélküli leképezés azért jó, mert a választó eddig is csak palettaszínt adott; a hátránya, hogy a „kiemelő” színű kategória a kiemelővel együtt vált színt. Gyula kérte (a stílusellenőrzés javaslatainak mindegyikét).
- **Érinti:** `src/utils/pocketChartColors.ts`, `src/components/DonutChart.tsx`, `src/utils/animateLayout.ts`, `src/utils/hitSlop.ts`, `src/utils/formatShare.ts`, `scripts/style-scan.mjs`, `scripts/check.sh`, `tests/chartColors.test.ts`, `DESIGN.md`

## 2026-10-28 · Szövegek rövidítése és a képernyők áttekinthetősége (eszközön végigjárva)
- **Döntés:** minden funkció alatt legfeljebb egy rövid magyarázó sor; a Pockets lista zsebenként mutatja az egyenleget (új, csak olvasó lekérdezés: `sumBalancesByPocket`); a tranzakciósorok közös `TransactionRow`-ra álltak (előjeles összeg elöl, dátum a végén); a tranzakcióűrlap összege az eszköz mellett van, a Mentés egy képernyőn belül látszik; a diagram x-tengelye saját sor (a könyvtár az adatlépés szélességére töri a feliratot); az Y-tengely kerek lépésekkel (1, 2, 2,5, 5 × 10^n) rajzol; a fix kategória-árnyalatok közül a szürke barna lett, hogy a „Uncategorized” (szürke) ne keveredjen vele; a régi szürke szín a barnára képződik le.
- **Miért:** Gyula kérte a „junk text” csökkentését és a design/UX átvizsgálását; a telefonon kiderült, hogy a 12 px-es x-tengely-feliratok három sorba törtek, a History sorában az összeg a legkisebb, legalsó szöveg volt, a Pockets listán nem látszott egyenleg, a Jar letiltott gombja olvashatatlan volt.
- **Érinti:** `src/components/TransactionRow.tsx`, `src/utils/transactionAmount.ts`, `src/utils/assetLabel.ts`, `src/db/repositories/transactions.ts`, a képernyők, `DESIGN.md`
