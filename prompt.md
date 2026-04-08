You are a senior backend engineer performing an internal audit of an 
aggregation API in a pharmacy domain Spring Boot service.

I am pasting the source code of an aggregation API below. Your job is 
to fully reverse-engineer what it does internally so I can understand 
what I need to replicate when migrating its consumers to call core APIs 
directly.

## Your task

### 1. Downstream API call inventory
For every HTTP call this aggregation API makes:
- Full URL (host + path + query params, or template if dynamic)
- HTTP method
- Which Java class/method makes the call
- Exactly what data it is fetching and why
- Whether the call is mandatory or conditional (and what condition gates it)
- Whether calls are sequential or parallel

### 2. Response merging & transformation
- Show how responses from each downstream call are combined
- Identify any field renaming, type conversion, or computation 
  (e.g. derived fields, date formatting, currency math)
- Note any fields that are hardcoded or defaulted rather than 
  fetched from a downstream source
- Show the final response shape with each field mapped back to 
  its origin call

Format this as a field lineage table:

  | Response Field         | Source API URL                        | Source Field       | Transformation         |
  |------------------------|---------------------------------------|--------------------|------------------------|
  | prescriptions[].rxId   | https://core.internal/rx?orderId={}   | rx.id              | none                   |
  | shippingAddress.zip    | https://addr.internal/address/{id}    | postalCode         | renamed                |
  | deliveryDates[0].date  | https://dates.internal/delivery       | dates[0].isoDate   | formatted MM/DD/YYYY   |

### 3. Defensive logic & error handling
For each downstream call, document:
- What happens if the call fails (timeout, 4xx, 5xx)
- Whether a fallback value or cached response is used
- Whether the failure is silent (partial response returned) or 
  fatal (entire request fails)
- Any null checks or default values applied before the field 
  is included in the response

### 4. Data contract surface
List every field in the aggregation API response and classify it:

  | Field                  | Nullable | Has Default | Source          | Migration Risk                  |
  |------------------------|----------|-------------|-----------------|----------------------------------|
  | prescriptions[].status | No       | No          | rx-service       | Must confirm parity in core API  |
  | billingAddress.line2   | Yes      | ""          | address-service  | Low — nullable in both           |

Flag any field where:
- The core API equivalent has not been confirmed to exist
- The transformation logic is non-trivial and must be replicated
- The field is computed from multiple sources

## Output format
- Use the tables above for sections 3 and 4
- Use a numbered call chain for section 1
- Use annotated pseudocode or prose for section 2 where tables 
  are insufficient
- At the end, produce a MIGRATION CHECKLIST: a prioritized list 
  of what must be built or confirmed before this aggregation API's 
  callers can safely switch to core APIs directly

## Code to analyze
[PASTE AGGREGATION API CODE HERE]
