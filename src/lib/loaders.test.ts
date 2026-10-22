import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { revalidateUnlessOnly, searchWithout } from "./loaders";

const args = (current: string, next: string, formMethod?: string) =>
  ({
    currentUrl: new URL(current, "http://x"),
    nextUrl: new URL(next, "http://x"),
    formMethod,
    defaultShouldRevalidate: true,
  }) as unknown as Parameters<ReturnType<typeof revalidateUnlessOnly>>[0];

describe("searchWithout", () => {
  it("drops the params and optionally sorts the rest", () => {
    const url = new URL("http://x/?b=2&view=list&a=1");
    assert.equal(searchWithout(url, ["view"]), "b=2&a=1");
    assert.equal(searchWithout(url, ["view"], { sort: true }), "a=1&b=2");
  });
});

describe("revalidateUnlessOnly", () => {
  const should = revalidateUnlessOnly(["view"], { sort: true });
  it("skips when only the client params changed", () => {
    assert.equal(should(args("/e?view=a&x=1", "/e?x=1&view=b")), false);
  });
  it("reloads for other params, other paths and submits", () => {
    assert.equal(should(args("/e?x=1", "/e?x=2")), true);
    assert.equal(should(args("/e", "/f")), true);
    assert.equal(should(args("/e?view=a", "/e?view=b", "post")), true);
  });
  it("reloads the same address only when asked", () => {
    assert.equal(should(args("/e?x=1", "/e?x=1")), false);
    assert.equal(revalidateUnlessOnly(["view"], { revalidateSameUrl: true })(args("/e?x=1", "/e?x=1")), true);
  });
});
