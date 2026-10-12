# Source permanent among mixed stack materials

`PlaceUnder.mixedSources.sourcePermanent` includes the effect source's own battle-area permanent as a material. It excludes breeding, the destination itself, and a source that is no longer on the controller's field. Combining it with `battleAreaPermanents` does not offer the same top card twice.

The source is collected independently of `target.filter`. The filter applies to the other enabled origins, so a Tamer source can be combined with named Digimon from trash without making other Tamers eligible. `requiredNamesExact` and `target.count` retain the complete material recipe. Availability checks and resolution use the same candidate collector.

Selection finishes before the controller orders the materials. The existing placement routine moves the ordered cards to the bottom of the destination stack. It retains its existing treatment of a permanent's sources and linked cards.

`takato-places-source-and-trash-materials.fixture.ts` supplies multiple field and trash copies. The API regression proves that only the activating Takato and the named trash Digimon enter the ordering decision, rejects substituting another Tamer, and verifies the chosen stack order after evolution is declined. The E2E spec uses the same fixture and verifies both accepting and declining evolution through the real interface. The existing EX2-007, EX2-048, and BT26-102 tests protect the other mixed-source recipes.
