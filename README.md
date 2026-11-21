[![make.fun](https://make.fun/badge/news-image-20261120.svg)](https://make.fun/bounty/news-image-20261120)
[![rank](https://make.fun/badge/news-image-20261120/vayne01-hub/news-image-20261120/rank.svg)](https://make.fun/bounty/news-image-20261120)
[![reward](https://make.fun/badge/news-image-20261120/vayne01-hub/news-image-20261120/reward.svg)](https://make.fun/bounty/news-image-20261120)

# news-image-20261120

One PNG that sums up the world news of Friday 20 November 2026, drawn from
scratch as a broadsheet newspaper front page: masthead with the giant date,
a night-strike hero over the Dnipro bridges, a numbers strip, six feature
cards, a full-width numbered world map, and a DATE CHECK footer.

The C3 layout from the 20261119 edition, adapted to 7 stories and 8 map
pins. Every story is numbered twice — a red numbered badge on the hero
("1" and "2", the story's two pins) and on each feature card (3–8), and a
matching numbered red pin on the map — so card, number and place
cross-check at a glance. Leader lines are drawn under every disc, and pin
1's disc is kept clear of every other disc and leader by at least 26px,
so no leader can ever cross a pin's number. The stroke font uses
per-glyph advances plus kerning pairs for the narrow letters (i, l, j)
after wide ones (M, m, w, A, V, T), which closes the hollow gaps inside
words.

Stories: Russia's biggest strike of the war hits Kyiv's bridges, with two
missiles and a drone landing inside Poland; the AI rout tips the S&P 500
and the Dow into correction (Nvidia −14.0%, Anthropic −8.5%); Cyclone
Akvan makes landfall in Odisha (370,000+ evacuated); a magnitude 6.7
quake shakes Peru's Andes; the UK and EU seal a post-Brexit reset deal
(100,000 youth visas a year); Trump defends his Putin ties in a
90-minute presser; Estonia shuts its Russia border for six months.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only, no network) draws the page with
its own framebuffer, primitives, stroke font and PNG encoder, and writes
exactly one file: `$MAKEFUN_OUTPUT_DIR/entry.png` (1024x1024, deterministic —
two runs are byte-identical).

## Entry

- Competition: [news-image-20261120](https://make.fun/bounty/news-image-20261120)
- License: MIT
