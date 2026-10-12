/**
 * Schema-derived test data.
 *
 * @module
 */
import { Arbitrary, Effect, type Schema } from "effect";

/**
 * One value generated from a schema.
 *
 * @since 2.0.0
 * @category Test
 */
export const sample = <S extends Schema.Constraint>(schema: S) =>
	Arbitrary.sampleEffect(Arbitrary.schema(schema), { count: 1 }).pipe(
		Effect.flatMap(([value]) =>
			value === undefined
				? Effect.die("no sample generated")
				: Effect.succeed(value),
		),
		Effect.orDie,
	);

/**
 * Several values generated from a schema.
 *
 * @since 2.0.0
 * @category Test
 */
export const samples = <S extends Schema.Constraint>(
	schema: S,
	count: number,
) =>
	Arbitrary.sampleEffect(Arbitrary.schema(schema), { count }).pipe(
		Effect.orDie,
	);

/**
 * `count` values from a schema with distinct `id`s.
 *
 * @since 2.0.0
 * @category Test
 */
export const distinct = <S extends Schema.Constraint>(
	schema: S,
	count: number,
	id: (value: S["Type"]) => string,
) =>
	samples(schema, count * 4).pipe(
		Effect.map((values) => {
			const seen = new Map<string, S["Type"]>();
			for (const value of values)
				if (!seen.has(id(value))) seen.set(id(value), value);
			return [...seen.values()].slice(0, count);
		}),
		Effect.flatMap((values) =>
			values.length === count
				? Effect.succeed(values)
				: Effect.die("not enough distinct samples"),
		),
	);
