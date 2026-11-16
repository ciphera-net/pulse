---
product: pulse
type: fixed
---
When a dashboard read gets no answer within 10 seconds, Pulse now sends it again on its own and shows an error only if the second try fails too. Before, a read held up on its way waited 30 seconds and then showed "Failed to load dashboard analytics".
