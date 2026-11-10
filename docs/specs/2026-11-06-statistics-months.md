# Spec: Statisztika hónapokra bontva (áttekintő + hónapnézet)

Állapot: **megvalósítva, eszközön kipróbálva (Gyula, 2026-11-06).** Készült: 2026-11-06. Ág: `feat/statistics-months` (a `main`-ről).

## Cél

A Statistics lap ma időszakra épül: négy beállítás (eszköz, zseb, kategória, időszak), alattuk egy egyenleg-vonaldiagram és három fánk. Arra nem tud válaszolni, hogy „mi történt októberben”. Az új lap a hónapot teszi egységgé, és két szinten mutatja meg: az **áttekintő** azt, hogy hogyan alakultak a hónapok, a **hónapnézet** azt, hogy mi volt egy adott hónapban, a **History** pedig azt, hogy melyik tételek voltak ezek. A fő szempont az átláthatóság: egy képernyő egy kérdésre felel, kevés kapcsolóval. Gyulának szól, aki a saját telefonján nézi a pénzügyeit.

Döntések a beszélgetésből (2026-11-06): a hónapnézet a „B” változat (a bevétel- és kiadáscsempe a választó); fánk nincs, mert negatív értéket nem tud ábrázolni; automatikus észrevételek nincsenek; a hónap végi egyenleg benne van; naptári hónap; egyszerre egy eszköz (nincs átváltás); a viszonyítás a 12 havi átlag; teljesítményre optimalizálva.

## Viselkedés (elfogadási feltételek)

**Közös**
- [ ] Csak `income` és `expense` számít bevételnek vagy kiadásnak; a `transfer` soha (ahogy ma). Kivétel a hónap végi egyenleg, ahol az átvezetés a zsebkör szerint mozgat (mint a mai `getBalanceTimeline`).
- [ ] Hónap = naptári hónap a készülék időzónájában; a határokat a `monthRangeFor` adja (`src/domain/monthlyReport.ts`), SQL-es időzóna-kezelés nincs.
- [ ] Minden összeg `bigint`: az SQL a szummát `CAST(... AS TEXT)`-ként adja, mint a `src/db/repositories/report.ts`. `number` csak a kirajzoláshoz kell (oszlop- és sávhossz, százalék).
- [ ] A kiválasztott **eszköz** és **zsebkör** (All pockets / Outside Jar / egy zseb) közös a két képernyőn: ha a hónapnézetben váltasz, az áttekintő is azzal jön vissza. Csak memóriában él, nem kerül a `user_settings`-be; az app újraindítása után az alapértékek érvényesek (a default pénznem, All pockets). A Home felől érkező `initialCurrency` paraméter továbbra is beállítja az eszközt.
- [ ] A csipek (`[HUF ▾] [All pockets ▾]`) koppintásra közvetlenül megnyitják a választót (`ModalSelectField`); lenyitható beállításpanel nincs.

**Áttekintő (`Statistics`)**
- [ ] Felül a két csip; a fejléc jobb oldalán `Export` szövegű gomb (a `ReportExport` képernyőt nyitja; a mai nagy gomb megszűnik).
- [ ] **Last 12 months** kártya: 12 oszloppár (a folyó hónap a jobb szélső), bevétel és kiadás egymás mellett, alatta hónaprövidítés. Jelmagyarázat szöveggel („Income”, „Expense”), nem csak színnel. Egy oszlopra koppintva a hónapnézet nyílik. Képernyőolvasónak a diagram egy `image`, egymondatos összefoglalóval; a hozzáférhető változat a hónaplista.
- [ ] Az oszlopok a nullától indulnak; egy negatív havi összeg (a visszatérítés több, mint a kiadás) lefelé rajzolódik a nullvonal alá. A skála kerek lépésekre igazodik (a mai `niceStep` mintája); a legfelső vonal felirata az egyetlen tengelyfelirat.
- [ ] **Months** lista: hónaponként egy sor, a legújabb felül: `Oct 2026 … net −48 200`, alatta `in 640 000 · out 688 200`. A folyó hónap mellett „(so far)”. A sor a hónapnézetet nyitja. A lista végén `Show earlier months` gomb tölti be a következő 12 hónapot; ott áll meg, ahol az eszköz első tranzakciója van (onnan a gomb eltűnik).
- [ ] Üres állapot: ha az eszköznek ebben a zsebkörben nincs bevétele vagy kiadása, a diagram és a lista helyett „No income or expenses in HUF yet.” Ha nincs eszköztípus: a mai szöveg marad.
- [ ] **Balance over time** a lap alján, alapból csukva. Lenyitva a mai vonaldiagram jelenik meg a saját időszakválasztójával (`TimeRangePickerField`), a csipek eszközével és zsebkörével. Kategóriaszűrő nincs többé. Az adat csak lenyitáskor töltődik be.
- [ ] Megszűnik: a zseb-összetétel fánk, a kategóriánkénti két fánk, a kategóriaszűrő, a „Statistics settings” panel.

**Hónapnézet (`StatisticsMonth`, új képernyő)**
- [ ] A fejléc címe a hónap („October 2026”); alatta a két csip, majd `‹  October 2026  ›` léptető. A `›` a folyó hónapnál le van tiltva, a `‹` az eszköz első tranzakciójának hónapjánál. Mindkettő `accessibilityLabel`-t kap („Previous month”, „Next month”), és 48 dp-s koppintási felületet. Vízszintes húzással nem lehet léptetni (ütközne az iOS vissza-gesztusával).
- [ ] **Két csempe** egymás mellett: `INCOME +640 000` és `EXPENSE −688 200`, alattuk `avg 610 000`. A csempe egy választó (`accessibilityRole="radio"`, `accessibilityState.selected`); a kijelölt vastagabb, kiemelő színű keretet kap, és a lebontás címe is megnevezi („Expense by …”), így a kijelölés nem csak színből derül ki. Alapból az `Expense` van kijelölve; léptetéskor a választás megmarad.
- [ ] **Átlag:** a kiválasztott hónapot megelőző legfeljebb 12 *teljes* hónap havi átlaga, a folyó hónap nélkül. Csak azok a hónapok számítanak, amelyek az eszköz első tranzakciójának hónapja óta teltek el (ebben a zsebkörben); közöttük az üres hónap 0-val számít. 3 hónapnál kevesebb előzménynél az `avg` sor nem jelenik meg. Az átlag `bigint` osztás (nullára kerekítve), csak kijelzésre.
- [ ] A csempék alatt egy sor: `Net −48 200 · Balance at month end 1 204 500`. A hónap végi egyenleg = a zsebkör egyenlege a hónap utolsó pillanatában (a folyó hónapnál: most), átvezetésekkel együtt.
- [ ] **Lebontás:** cím `Expense by [ Category | Pocket ]` (kétállású kapcsoló). Egy zsebre szűkített zsebkörnél a kapcsoló nem jelenik meg, a cím „Expense by category”.
  - Sorok csökkenő összeg szerint: név, összeg, részarány, alatta vízszintes sáv (a sáv hossza a legnagyobb sorhoz arányos). Kategóriánál a kategória színe (`resolveStoredColor`, különben `assignChartColors`), zsebnél a diagrampaletta a zseb azonosítója szerint. Kategória nélkül: „Uncategorized”; zseb nélkül (ha előfordul): „No pocket”. Archivált zseb a nevével szerepel.
  - Legfeljebb 7 sor látszik, a többi `Show all 12` mögött (lenyitva `Show fewer`).
  - Nulla összegű sor nem jelenik meg. Negatív összegű sor (több a visszatérítés, mint a kiadás) a lista végére kerül, előjellel, sáv és részarány nélkül. A részarány a pozitív sorok összegéhez mér.
  - Egy sorra koppintva a History nyílik meg, pontosan azokra a tételekre szűrve, amelyekből a sor összege áll (lásd lent).
- [ ] Üres hónap: a csempék 0-t mutatnak, a lebontás helyén „No expenses in October 2026.” (illetve „No income …”); az egyenleg-sor megmarad.
- [ ] A folyó hónap címe mellett „(so far)”.

**History lefúrás**
- [ ] A `History` új, opcionális route-paramétert kap: `drill: { label, currency, kind, fromMs, toMs, categoryId?, pocketIds? }`. Ha jelen van, a History a normál szűrők helyett egyetlen chipet mutat (`Oct 2026 · Groceries · Expense ×`), és pontosan ezekre a feltételekre kérdez: a megadott `kind`, Jar-os átvezetés-összevonás nélkül (`jarPocketId: null`), `fromMs <= occurred_at < toMs`. A `×` eltávolítja a chipet, és visszaáll a normál History.
- [ ] A `pocketIds` a lebontási sor mögötti, abban a hónapban ténylegesen szereplő zsebek listája (az áttekintő adataiból), így „Outside Jar” zsebkörnél is pontosan ugyanazok a tételek jönnek. Egy zsebre szűkítve a zseb azonosítója.
- [ ] A History-ban listázott tételek összege megegyezik a lebontási sor összegével (ez az ellenőrzés kulcsa).

**Teljesítmény**
- [ ] Áttekintő megnyitása: legfeljebb **2 lekérdezés** (12 hónap havi összegei egyben, és az eszköz első tranzakciója). `Show earlier months`: 1 lekérdezés.
- [ ] Hónapnézet megnyitása: legfeljebb **3 lekérdezés** (a hónap és az előző 12 hónap összegei egyben; a hónap végi egyenlegek egyben; az első tranzakció). Léptetéskor csak a hiányzó hónapok töltődnek be, egy kötegben; előre léptetéskor általában 0 lekérdezés.
- [ ] Hónaponként külön lekérdezés nincs; a hónaphatárok egy `VALUES` CTE-ben mennek át (lásd Terv).
- [ ] Képernyőfókuszkor (például a History-ból visszatérve, ahol tételt szerkesztettek) a képernyő friss adatot kér, régi gyorsítótárat nem mutat.
- [ ] Egy régebbi, közben elavult válasz nem írja felül az újabbat (a `loadSeq` minta a `HistoryScreen`-ből).

## Hatókörön kívül
- Automatikus észrevételek („+62% az átlaghoz képest”).
- Állítható hónapkezdő nap (fizetésnaptól fizetésnapig); később, beállításként.
- Átváltás közös pénznemre, több eszköz egy nézetben.
- A tavalyi azonos hónappal vagy az előző hónappal való összevetés.
- A hónap legnagyobb tételei lista.
- A `ReportExportScreen` és a `getReportRows` átírása az új egylekérdezéses mintára (később kézenfekvő, de most nem).
- Séma, migráció, `src/security/`, `.tarcak` mentés: **nincs változás**. Új függőség: nincs (a sávok és az oszlopok sima `View`-k).

## Terv

Minták: tiszta logika és Node-teszt a `src/domain/monthlyReport.ts` + `tests/monthlyReport.test.ts` párosa szerint; SQL `bigint`-szummával a `src/db/repositories/report.ts` szerint; zsebkör-SQL a `scopeSql` és a `baselineMinorBefore` szerint (`src/db/repositories/statistics.ts`); elavult válasz eldobása a `HistoryScreen` `loadSeq`-je szerint; színek `useAppTheme()`-ből és a `pocketChartColors`-ból.

| Fájl | Mi |
|---|---|
| `src/domain/monthlyStats.ts` (új, tiszta) | Típusok: `FlowRow { month, kind, categoryId, pocketId, total: bigint }`, `MonthSummary { key, income, expense, net }`. Függvények: `previousMonths(key, n)` (a `monthRangeFor`-ra építve), `summarizeMonth(rows, key)`, `monthlyAverage(summaries, key, kind, firstMonthKey)` (a fenti átlagszabály), `buildBreakdown(rows, key, kind, by: 'category' \| 'pocket')` → rendezett sorok `{ id, total, share, pocketIds }` és a negatív sorok külön, `chartScale(values)` (kerek lépés, negatív rész). Nincs RN- vagy DB-import. |
| `src/db/repositories/monthlyStats.ts` (új) | `getMonthlyFlows(currency, scope, months)`: egy lekérdezés, `WITH m(k, f, t) AS (VALUES (?, ?, ?), …)`, `JOIN transactions t ON t.occurred_at >= m.f AND t.occurred_at < m.t`, `kind IN ('income','expense')`, `GROUP BY m.k, t.kind, t.category_id, t.pocket_id`, szumma szövegként. Kategória neve és színe, zseb neve `LEFT JOIN`-nal. `getMonthEndBalances(currency, scope, months)`: egy lekérdezés, az első hónap alsó határa nyitott (minden korábbi tétel ide esik), az előjel a zsebkör szerint (`baselineMinorBefore` CASE-ágai); az eredmény halmozott összeg JS-ben, `bigint`. Legfeljebb 24 hónap kötegenként (paraméterszám). `getEarliestOccurredAt(currency, scope)`: a mai függvény bővítése. A CTE-építés (`monthsCteSql(months)`) a `monthlyStats.ts` domainben él, hogy tesztelhető legyen. |
| `src/screens/statistics/useStatisticsSelection.ts` (új) | Közös, csak memóriában élő eszköz- és zsebkörválasztás (`useSyncExternalStore`, modulszintű tároló). |
| `src/components/SegmentedControl.tsx` (új) | Kétállású kapcsoló (`radio` szerep, kijelölt állapot kerettel és félkövér felirattal, 48 dp magas). A `DESIGN.md` Components részébe bekerül. |
| `src/components/RankedBarList.tsx` (új) | A lebontás sorai (név, összeg, részarány, sáv, `Show all N`, negatív sorok), soronként `onPress`. |
| `src/components/MonthlyBarsChart.tsx` (új) | 12 oszloppár `View`-kból, oszloponként egy `Pressable` (címke: „October 2026, income 640 000, expense 688 200”), a nullvonal és a legfelső vonal felirata. |
| `src/components/BalanceTrendCard.tsx` (új, kiemelés) | A mai vonaldiagram-kártya a `StatisticsScreen`-ből, kategóriaszűrő nélkül, saját időszakválasztóval. |
| `src/screens/StatisticsScreen.tsx` (átírás) | Áttekintő: csipek, `MonthlyBarsChart`, hónaplista, `BalanceTrendCard` (csukva). Fejléc-gomb: `navigation.setOptions({ headerRight })`. |
| `src/screens/StatisticsMonthScreen.tsx` (új) | Hónapnézet; route: `StatisticsMonth: { monthKey: string }` a `src/navigation/types.ts`-ben és a navigátorban. |
| `src/domain/transactionFilter.ts`, `src/screens/HistoryScreen.tsx`, `src/navigation/types.ts` | `TransactionFilter` + `fromMs`/`toMs`; `History` paraméter `drill`, a lefúrás-chip. |
| Törlés | `src/components/DonutChart.tsx`; a `statistics.ts`-ből `getPocketSlicesAt`, `balanceMinorForPocketAt`, `getCategorySlices`, `CategoryFilter` és a `getBalanceTimeline` kategóriaparamétere (csak a régi Statistics használta őket). `DESIGN.md` Charts része: a fánk helyett az oszlopok és a sávok. |

Adatvédelem (`privacy-check`): nincs új adatmező, export, hálózat, napló vagy harmadik fél; csak olvasás a meglévő főkönyvből, a képernyőn. A választás nem tárolódik.

## Eltérések a tervtől (megvalósításkor)
- Az „első tranzakció” az első olyan tétel, amely a zsebkör egyenlegét változtatja, átvezetés is (`getFirstActivityAt(currency, scope)` a `monthlyStats` repóban); így egy csak átvezetésből feltöltött zseb hónapjai is elérhetők. A meglévő `getEarliestOccurredAt` változatlan (a `TimeRangePickerField` használja). Ha nincs ilyen tétel: „No HUF transactions yet.”; a „Balance over time” kártya ekkor is látszik.
- A „Balance over time” kártya alapból **nyitva** van (Gyula kérése az eszközös próba után, 2026-11-06); csukva nem tölt. Így az áttekintő megnyitásakor a 2 havi lekérdezés mellé még 2 fut (legkorábbi dátum, idősor).
- A csempék és a kapcsoló a `radio` szerephez illő `accessibilityState.checked`-et használják (nem `selected`).
- Hónapnézetben visszalépéskor egy hiányzó hónap 2 lekérdezés (összegek és egyenleg), nem 1.
- A History lefúrási paramétere `TransactionDrill` (`src/domain/transactionFilter.ts`); a `categoryId: null` jelenti a kategória nélkülit. A szűrőt a `filterForDrill` építi, és teszt őrzi, hogy a listázott tételek összege megegyezik a sor összegével.
- A repó-réteg tesztjei valódi SQL-t futtatnak egy memóriabeli `node:sqlite` adatbázison (`tests/stubs/dbClient.ts`, `tests/ledgerFixture.ts`). Ezzel derült ki a B24 (az „Outside Jar” kezdőegyenleg hibája), és a javítás külön commitban ment.

## Feladatok

Mindegyik külön commit, a saját tesztjével; a végén `scripts/check.sh` = OK.

1. [x] **Domain:** `src/domain/monthlyStats.ts` + `tests/monthlyStats.test.ts`. Teszt: hónaplépés év határán; összegzés `bigint`-tel 2^53 fölött; átlag (kevesebb mint 3 hónap → nincs; az első tranzakció előtti hónapok kimaradnak; üres hónap = 0; a folyó hónap nem számít); lebontás (rendezés, a 7-es levágás nem itt, hanem a komponensben; nulla kimarad; negatív külön; `pocketIds` sorpontosan); `chartScale` negatív értékkel; `monthsCteSql` paraméterei.
2. [x] **Repó:** `src/db/repositories/monthlyStats.ts`, `getEarliestOccurredAt(currency, scope)`. Kézi ellenőrzés teszt-vaulttal: egy hónap összegei egyeznek a `ReportExport` előnézetével (ugyanaz a zsebkör), a hónap végi egyenleg a mai „Balance over time” görbe adott napi értékével.
3. [x] **Közös választás és alap-komponensek:** `useStatisticsSelection`, `SegmentedControl`, `RankedBarList`, `MonthlyBarsChart`. A `DESIGN.md`-be az új komponensek.
4. [x] **Áttekintő** átírása, `BalanceTrendCard` kiemelése, `Export` a fejlécbe.
5. [x] **Hónapnézet** képernyő és route.
6. [x] **History lefúrás:** `fromMs`/`toMs` a `buildTransactionFilter`-ben (teszt a `tests/transactionFilter.test.ts`-ben: határok `>=`/`<`; `jarPocketId: null` mellett az `income` nem húz be átvezetést), `drill` paraméter, chip.
7. [x] **Takarítás:** a halott kód és a `DonutChart` törlése, `DESIGN.md` Charts, README Statistics sora.
8. [x] **Eszközön** (dev build, teszt-vault, világos és sötét téma, legnagyobb betűméret): lásd Ellenőrzés; utána `design-review`.

## Ellenőrzés

- `scripts/check.sh` → OK (típusok, stílus-szkenner, egységtesztek).
- Eszközön, teszt-vaulttal, amelyben van: legalább 14 hónapnyi adat, átvezetés a Jar és egy zseb között, visszatérítés (negatív kiadás), egy kategória nélküli tétel, egy archivált zseb forgalommal, két eszköz.
  1. Az áttekintő 12 oszloppárja és a lista ugyanazokat a számokat mutatja, és egyezik a `ReportExport` előnézetével.
  2. Egy hónapra koppintva a hónapnézet ugyanazt a hónapot mutatja; a `‹ ›` léptet, a folyó hónapnál a `›` tiltott.
  3. Az `Expense` és az `Income` csempe váltja a lebontást; a `Category | Pocket` kapcsoló vált; egy zsebre szűkítve a kapcsoló eltűnik.
  4. Egy lebontási sorra koppintva a History tételeinek összege egyezik a sor összegével, „Outside Jar” zsebkörnél is.
  5. A hónapnézetben eszközt váltva, majd visszalépve az áttekintő is az új eszközt mutatja.
  6. A hónap végi egyenleg egyezik a `Balance over time` görbe hónap végi értékével.
  7. Egy tételt a lefúrásból szerkesztve, majd visszalépve a számok frissülnek.
  8. Legnagyobb betűméretnél nincs levágott összeg; a csempék két sorba törhetnek, de olvashatók.
- Teljesítmény: fejlesztői buildben ideiglenes időméréssel (nem kerül commitba) a lekérdezések száma és ideje az áttekintő és a hónapnézet megnyitásakor; elvárás, hogy a fenti számú lekérdezés fusson le, és ne nőjön a hónapok számával.
