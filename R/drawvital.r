library(jsonlite)
library(httr)

options(encoding="UTF-8");

# return data.frame
load_vital <- function (url) {
  zcont <- GET(url)
  zcont <- content(zcont)
  tmpnam <- tempfile()
  tf <- file(tmpnam, "wb")
  writeBin(zcont, tf)
  f <- gzfile(tmpnam)
  recs <- fromJSON(sprintf("[%s]", paste(readLines(f),collapse=",")))
  unlink(tmpnam)
  return (recs)
}

# loading
recs = load_vital("1.vital")
tids = unique(recs[,"tid"])

# drawing
par(mfrow=c(length(tids),1), mai=c(0,0,0,0))
lapply(tids, function (tid) {
  track = recs[recs$tid == tid,]
  plot(range(track["dt"]) + c(0,0.1), c(track[1,"mindisp"],track[1,"maxdisp"]), type="n",xlab=track[1,"tname"],ylab=track[1,"unit"])
  apply(track,1,function (rec) {
    lines(seq(rec$dt, rec$dt+length(rec$val)*1/rec$srate, length.out = length(rec$val)), rec$val, col="green")
  })
})