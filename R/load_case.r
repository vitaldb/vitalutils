read_csv <- function(file_url) {
  con <- gzcon(url(file_url))
  txt <- readLines(con)
  return(read.csv(textConnection(txt), na.strings=c("", "-nan(ind)")))
}

cases <- read_csv('https://api.vitaldb.net/cases')
labs <- read_csv('https://api.vitaldb.net/labs')
trks <- read_csv('https://api.vitaldb.net/trks')

# inclusion / exclusion criterial for study
study_cases <- dt_trks[dt_trks$tname == 'SNUADC/ART', ]

# read arterial waveform of the first case
tid <- study_cases[1,'tid']
art <- read_csv(paste0('https://api.vitaldb.net/', tid))
head(art)

