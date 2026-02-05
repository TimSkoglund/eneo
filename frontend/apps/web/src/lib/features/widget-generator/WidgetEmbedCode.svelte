<script lang="ts">
  export let code: string;
  export let copyCode: () => Promise<void>;
</script>


<div class="pl-2.5">
<pre class="bg-primary max-h-72 overflow-auto rounded-xl text-xs p-4 border border-default">
<code>{code}</code>
</pre>
</div>
<div class="pl-2.5 flex justify-left">
<button
  type="button"
  on:click={copyCode}
  class="group inline-flex self-start items-center -mt-8 justify-center gap-3 rounded-md border text-left mix-blend-normal outline-offset-4 border-accent-default bg-accent-default text-on-fill hover:border-accent-stronger hover:bg-accent-stronger py-1 px-2 cursor-pointer"
>
  Kopiera kod
</button>
</div>


