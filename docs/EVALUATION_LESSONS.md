# Lesson generator evaluation

Model: `gemini-3.5-flash-lite`, temperature 0.3, 24 lessons of 5 words.

| Outcome | Lessons | Share |
| --- | --- | --- |
| first try | 19 | 79% |
| regenerated | 0 | 0% |
| fallback | 5 | 21% |

Latency: median 3186 ms, p95 6649 ms (includes regeneration and transient retry backoff).

## Word drop reasons (validator)

| Reason | Count |
| --- | --- |
| has a double letter, which is hard at level 1 | 8 |
| contains J or Z, which need motion and are kept for level 3 | 2 |

## Draft rejection reasons (triggered regeneration or fallback)

| Reason | Count |
| --- | --- |
| Too few valid words left after filtering | 10 |

## Transient API / network errors (retried separately from regenerations)

| Error | Count |
| --- | --- |
| 503 UNAVAILABLE | 2 |

## Every lesson

| Theme | Level | Outcome | Drafts | API calls | Net retries | ms | Words |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Animals | 1 | first try | 1 | 1 | 0 | 2066 | CAT, DOG, PIG, COW, BIRD |
| Animals | 2 | first try | 1 | 1 | 0 | 1161 | BEAR, LION, FROG, DUCK, FISH |
| Animals | 3 | first try | 1 | 1 | 0 | 3186 | TIGER, MONKEY, ZEBRA, RABBIT, PENGUIN |
| Food | 1 | first try | 1 | 1 | 0 | 5311 | MILK, CAKE, RICE, PEAR, SOUP |
| Food | 2 | fallback | 2 | 2 | 0 | 6658 | RICE, MILK, CAKE, PEAR, CORN |
| Food | 3 | first try | 1 | 1 | 0 | 3046 | APPLE, PIZZA, BREAD, WATER, COOKIE |
| Family | 1 | first try | 1 | 1 | 0 | 3496 | MOM, DAD, BOY, GIRL, CAT |
| Family | 2 | first try | 1 | 2 | 1 | 3275 | MOM, DAD, BABY, SISTER, HOME |
| Family | 3 | first try | 1 | 1 | 0 | 2209 | MOTHER, FATHER, SISTER, BROTHER, BABY |
| School | 1 | fallback | 2 | 2 | 0 | 5130 | PEN, BAG, DESK, MAP, RULER |
| School | 2 | first try | 1 | 1 | 0 | 4188 | DESK, BOOK, PEN, RULER, BAG |
| School | 3 | first try | 1 | 1 | 0 | 5241 | PENCIL, DESK, BOOK, RULER, PAPER |
| Colors | 1 | fallback | 2 | 2 | 0 | 2984 | RED, BLUE, PINK, WHITE, BLACK |
| Colors | 2 | first try | 1 | 1 | 0 | 5051 | APPLE, LEAF, OCEAN, LEMON, CLOUD |
| Colors | 3 | first try | 1 | 1 | 0 | 2138 | GREEN, BROWN, WHITE, BLACK, PURPLE |
| Nature | 1 | fallback | 2 | 3 | 1 | 10116 | SUN, LEAF, RAIN, SNOW, STAR |
| Nature | 2 | first try | 1 | 1 | 0 | 2596 | TREE, BIRD, LEAF, ROCK, RIVER |
| Nature | 3 | first try | 1 | 1 | 0 | 3077 | RIVER, PLANT, ROCK, BIRD, CLOUD |
| Home | 1 | fallback | 2 | 2 | 0 | 6401 | BED, CUP, LAMP, SOFA, KEY |
| Home | 2 | first try | 1 | 1 | 0 | 1367 | DOOR, CHAIR, BED, LAMP, BOWL |
| Home | 3 | first try | 1 | 1 | 0 | 6649 | HOUSE, DOOR, SOFA, TABLE, BED |
| Body | 1 | first try | 1 | 1 | 0 | 2031 | ARM, LEG, EYE, EAR, NOSE |
| Body | 2 | first try | 1 | 1 | 0 | 2018 | HAND, ARM, FACE, NOSE, FOOT |
| Body | 3 | first try | 1 | 1 | 0 | 2222 | HAND, FOOT, HEART, SMILE, BRAIN |
