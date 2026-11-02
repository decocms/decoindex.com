import { Fragment } from "react";
import { Kick } from "~/components/ui";

export interface Props {
  /** @title Rótulo */
  kicker?: string;
  /** @hide */
  brands?: string[];
}

/** The labels already on Circulei, read from the catalog. */
export default function Brands({ kicker = "Já circulam por aqui", brands = [] }: Props) {
  return (
    <section className="brands">
      <div className="wrap">
        <Kick>{kicker}</Kick>
        <p className="brand-list">
          {brands.map((b, i) => (
            <Fragment key={b}>
              {i ? <i aria-hidden="true" /> : null}
              {b}
            </Fragment>
          ))}
        </p>
      </div>
    </section>
  );
}
