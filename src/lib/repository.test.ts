import { beforeEach, expect, it } from "vitest";
import { localRepository } from "./repository";
beforeEach(() => localStorage.clear());
it("persists duplicates, edits, purchases, clears and individual deletion", async () => {
  const repo = localRepository();
  await repo.add({ name: "Milk", quantity: 1, unit: "piece" });
  await repo.add({ name: "Milk", quantity: 1, unit: "piece" });
  const initial = await repo.list();
  expect(initial).toHaveLength(2);
  await repo.update(initial[0].id, {
    name: "Oat milk",
    quantity: 1.5,
    unit: "l",
  });
  expect((await localRepository().list())[0].name).toBe("Oat milk");
  await repo.toggle(initial[0].id, true);
  await repo.toggle(initial[0].id, false);
  expect((await repo.list())[0].is_purchased).toBe(false);
  await repo.toggle(initial[0].id, true);
  await repo.clear();
  expect(await repo.list()).toHaveLength(1);
  await repo.remove(initial[1].id);
  expect(await repo.list()).toEqual([]);
});
it("rejects invalid writes and propagates storage failures", async () => {
  const repo = localRepository();
  await expect(
    repo.add({ name: "", quantity: 1, unit: "piece" }),
  ).rejects.toThrow();
  const failing = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage is full");
    },
  } as unknown as Storage;
  await expect(
    localRepository(failing).add({ name: "Milk", quantity: 1, unit: "piece" }),
  ).rejects.toThrow("Storage is full");
});
