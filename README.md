# Wakefield

A tabletop RPG for friends in the same room. One iPad in the middle of the table is the shared screen, everyone plays from their phone, and Claude is the Game Master.

> Eighty years ago every machine on Earth woke up at once. In the half-drowned city of Wakefield, humans, augmented humans, AIs, and stranger peoples live under a fragile peace called the Accord.

- **[World Bible](docs/world-bible.md)**: the setting, peoples, factions, and tone
- **[Rules](docs/rules.md)**: the Wake System (light d20, built for phones)
- **[Design](docs/design.md)**: product, architecture, AI GM pipeline, roadmap

Built on [Spacefast](https://spacefast.com) Zero: Preact + Tailwind client, TypeScript server, MySQL, and live queries.

## Run it locally

```sh
npm install
cp .env.example .env.server   # then fill in GM_SIGNING_KEY (and ANTHROPIC_API_KEY for the AI GM)
npm run dev                   # sf dev with persistent local state
```

Open the private URL `sf dev` prints. To simulate several players in one browser, add `?guest=<name>` to the page URL (dev only). Each name is a separate guest identity.

```sh
npm test            # unit tests for rules, content, and the GM contract
npm run typecheck
npm run dev > /tmp/dev.log &       # start sf dev, capturing its private URL
node tests/e2e.cjs /tmp/dev.log    # Playwright: one host + two phones play a full beat
```

## Deploy

```sh
sf login
sf publish
openssl rand -hex 32 | sf env set GM_SIGNING_KEY --secret --value-from-stdin
sf env set ANTHROPIC_API_KEY --secret --value-from-stdin   # paste the key, then Ctrl-D
```

Without `ANTHROPIC_API_KEY` the game still runs, using the offline backup narrator.

## How a session works

1. On the iPad: **Host a table**. It shows a 4-letter code and a QR code.
2. On phones: **Join a table**, enter the code, create or pick a character.
3. The table taps **Begin**. The GM sets the scene.
4. Each beat, players type what they do. When everyone's ready, the GM resolves it, calls for rolls, and players tap **d20** on their phones.
