# src/demo

`export --demo`: the real export pipeline on the bundled data of the fabricated German "Hotel Beispiel Berlin" (`BSP`, EUR, `Europe/Berlin`, September 2026, Odoo journal `APA`, Odoo 19 with `per_tax` and the rounding account `2700`) in `examples/demo/`. No config file, no secret, no network.

- `source.ts`: `RecordedApaleoSource`, a `SourceAdapter` over recorded apaleo responses, parsed with the same schemas and converters as the live adapter in `src/sources/apaleo/`. A business day without a file has no transactions, like apaleo's 204.
- `index.ts`: `demoRun(ctx)` loads `examples/demo/apaleo-odoo.config.yaml` without the environment, resolves its mapping paths inside the demo folder, sends the output to `./demo-output/` and returns a context with the demo clock (2026-10-05) and the recorded source.

The output is marked `DEMO`: `_DEMO` in the file name (`fileTag`), in the External IDs and before every reference of the Odoo file, and `DEMO` as the first protocol line. The demo data are a copy of the German fixture month (`test/fixtures/apaleo/de-month/`); `test/examples.test.ts` keeps them equal to it, so the demo and the posting tests show the same month. `test/examples.test.ts` validates every file of `examples/demo/apaleo/` against the Swagger excerpt, keeps `examples/demo/mapping-BSP.csv` equal to what `init-mapping --template skr03-hotel` writes on the demo chart for Odoo 19 with the Kurtaxe and Übernachtungsteuer rows as the Kanzlei filled them in, and `docs/examples/` equal to a real (unmarked) export of the demo data.
